# План исправления WebRTC звонков — Bastyon Chat

> Дата: 2026-03-16
> Статус: Анализ завершён, исправления не начаты

## Текущая ситуация

WebRTC звонки в new-bastyon-chat работают **нестабильно**. Выявлена асимметрия:

| Направление | Роль десктопа | Результат | Причина |
|-------------|---------------|-----------|---------|
| Mobile → Mac | answerer (polite) | Иногда OK, иногда фейл | При успехе ICE проходит. При фейле — ICE или таймаут |
| Mac → Mobile | offerer (impolite) | **Стабильный фейл** | ICE падает (NAT). После ICE restart Mac игнорирует negotiate от мобилки (impolite deadlock) |

### Корневые причины

1. **TURN** не настроен или настроен неполно — при разных NAT (WiFi + 4G) P2P-соединение невозможно
2. **Impolite deadlock** в SDK — после ICE restart caller (impolite) отбрасывает negotiate от callee
3. **Race condition ICE кандидатов** — кандидаты приходят до remote description
4. **Баги в SDK** — утечка таймеров, неочищаемый iceReconnectionTimeOut

### Архитектура звонков (краткая справка)

```
UI (Vue 3)
  ├── CallWindow.vue         — основной UI
  ├── IncomingCallModal.vue  — входящий звонок
  └── CallControls.vue       — управление (mute, camera, screen share)
        │
Service Layer
  └── call-service.ts        — оркестрация (762 строки)
        │
State (Pinia)
  └── call-store.ts          — состояние звонка
        │
SDK
  └── matrix-js-sdk-bastyon  — MatrixCall → RTCPeerConnection
        │
Transport
  └── Matrix events          — m.call.invite/answer/candidates/hangup
```

---

## P0 — Критические (устранение основных сбоев)

> Решают ~70-90% текущих проблем

### 1. TURN-сервер: настройка и проверка

**Проблема**: При двух NAT (WiFi + 4G) без рабочего TURN ICE не может установить P2P-соединение. Это причина **~40-60%** всех сбоев.

**Где менять**: конфигурация сервера (coturn + homeserver.yaml), не код

**Действия**:

1. Проверить, что `matrix.pocketnet.app` отдаёт TURN credentials:
   ```bash
   curl -H "Authorization: Bearer <TOKEN>" \
     https://matrix.pocketnet.app/_matrix/client/v3/voip/turnServer
   ```

2. Настроить coturn (`/etc/turnserver.conf`):
   ```ini
   listening-port=3478
   tls-listening-port=5349
   listening-ip=<INTERNAL_IP>
   external-ip=<PUBLIC_IP>
   use-auth-secret
   static-auth-secret=<SHARED_SECRET>
   realm=turn.bastyon.com
   no-tcp-relay
   # Relay ports
   min-port=49152
   max-port=65535
   # TLS (для TURNS на 443)
   cert=/etc/letsencrypt/live/turn.bastyon.com/fullchain.pem
   pkey=/etc/letsencrypt/live/turn.bastyon.com/privkey.pem
   ```

3. В `homeserver.yaml`:
   ```yaml
   turn_uris:
     - "turns:turn.bastyon.com:443?transport=tcp"   # корп. сети
     - "turn:turn.bastyon.com:3478?transport=udp"    # основной
     - "turn:turn.bastyon.com:3478?transport=tcp"    # fallback
   turn_shared_secret: "<SHARED_SECRET>"
   turn_user_lifetime: 86400000
   turn_allow_guests: true
   ```

4. Открыть порты на firewall:
   - 3478 (UDP + TCP) — TURN
   - 5349 (UDP + TCP) — TURNS (TLS)
   - 443 (TCP) — TURNS через HTTPS порт
   - 49152-65535 (UDP) — relay range

5. Типичные ошибки конфигурации coturn (чек-лист):
   - [ ] `external-ip` задан и соответствует реальному публичному IP
   - [ ] Нет AAAA DNS записи (или IPv6 реально работает)
   - [ ] `static-auth-secret` совпадает с `turn_shared_secret` в homeserver.yaml
   - [ ] Relay ports (49152-65535) открыты на firewall
   - [ ] TLS сертификаты актуальны (ZeroSSL рекомендуется, есть проблемы с LE + Chromium)
   - [ ] coturn не за NAT (или 1:1 NAT mapping с корректным external-ip)
   - [ ] `denied-peer-ip` не блокирует LAN, если coturn и Synapse на одной машине

**Проверка**:
```bash
turnutils_uclient -T -u user -w pass turn.bastyon.com
```
В chrome://webrtc-internals при звонке должны быть relay-кандидаты.

---

### 2. ICE candidate race condition

**Проблема**: `m.call.candidates` может прийти через Matrix /sync раньше `m.call.answer`. Вызов `addIceCandidate()` без `remoteDescription` бросает `InvalidStateError` и молча ломает соединение. Это причина **~20-30%** сбоев.

**Файл**: `matrix-js-sdk-bastyon/src/webrtc/call.ts`, метод `addIceCandidates()` (строка ~2962-2988)

**Действия**:
```typescript
// В addIceCandidates() добавить проверку:
if (!this.peerConn!.remoteDescription) {
  // Складываем в очередь, flush после setRemoteDescription
  this.pendingCandidates.push(...candidates);
  return;
}

// Каждый candidate в отдельном try/catch:
for (const candidate of candidates) {
  try {
    await this.peerConn!.addIceCandidate(candidate);
  } catch (e) {
    logger.warn(`Failed to add ICE candidate: ${e}`);
    // Продолжаем — один bad candidate не должен блокировать остальные
  }
}
```

После `setRemoteDescription()` (строка ~2006) добавить flush:
```typescript
await this.peerConn!.setRemoteDescription(description);
// Flush pending candidates
if (this.pendingCandidates.length > 0) {
  await this.addIceCandidates(this.pendingCandidates);
  this.pendingCandidates = [];
}
```

Также: баг `opponentPartyId` буфера — `odid !== odid` всегда false, кандидаты для multi-device сценария теряются.

**Проверка**: В логах видно "queued N candidates, flushed after SRD" при межсетевых звонках.

---

### 3. Impolite deadlock после ICE restart

**Проблема**: В WebRTC "perfect negotiation" caller = impolite. После ICE restart:
1. Mac (caller) шлёт новый offer
2. Mobile шлёт negotiate/answer
3. Mac **игнорирует** его: `"ignoring colliding negotiate event because we're impolite"`
4. Deadlock — соединение не восстанавливается

**Файл**: `matrix-js-sdk-bastyon/src/webrtc/call.ts`, метод `onNegotiateReceived()` (строка ~1976-1988)

**Текущий код**:
```typescript
const polite = this.direction === CallDirection.Inbound;
// ...
this.ignoreOffer = !polite && offerCollision;
```

**Исправление (Вариант A — рекомендуемый)**:
При ICE failure/disconnected не считать negotiate коллизией:
```typescript
const iceFailed = this.peerConn?.iceConnectionState === "failed"
  || this.peerConn?.iceConnectionState === "disconnected";
const polite = this.direction === CallDirection.Inbound || iceFailed;
```

**Вариант B** (менее предпочтительный): сделать caller всегда polite — может сломать другие сценарии.

**Проверка**: Звонок Mac→Mobile через WiFi↔4G: после ICE restart negotiate принимается → connected.

---

## P1 — Важные (обрывы посреди звонка)

### 4. Утечка таймера iceReconnectionTimeOut

**Проблема**: При `iceConnectionState → disconnected` ставится таймер `restartIce()` через 2с. При восстановлении в `connected` очищается только `iceDisconnectedTimeout` (30с), но **не** `iceReconnectionTimeOut`. Ненужный `restartIce()` дестабилизирует рабочее соединение.

**Файл**: `call.ts`, `onIceConnectionStateChanged()` (строка ~2269-2321)

**Исправление**: В блоке `connected`/`completed`:
```typescript
case "connected":
case "completed":
  this.clearIceDisconnectedTimeout();
  clearTimeout(this.iceReconnectionTimeOut);  // ← ДОБАВИТЬ
  // ...
```

**Проверка**: После disconnected → connected в логах не должно быть "ICE restarting" через 2с.

---

### 5. Добавить connectionstatechange listener

**Проблема**: Используется только `iceconnectionstatechange`. `RTCPeerConnection.connectionState` — более надёжный агрегат (учитывает DTLS + ICE).

**Файл**: `call.ts`, `createPeerConnection()` (строка ~2902)

**Действия**:
```typescript
pc.addEventListener("connectionstatechange", () => {
  logger.debug(`connectionState: ${pc.connectionState}`);
  if (pc.connectionState === "failed") {
    // Обработка аналогично ICE failed
  }
});
```

**Проверка**: В DevTools логи обоих state changes при звонке.

---

### 6. Обработка потери медиа-треков

**Проблема**: Браузер может молча убить трек (отключение USB-микрофона, отзыв permissions). Без `track.onended` звонок продолжается с тишиной/чёрным экраном.

**Файл**: `call-service.ts` (после `updateFeeds()` в состоянии `connected`)

**Действия**:
```typescript
// После получения localStream в connected:
const audioTrack = localStream.getAudioTracks()[0];
if (audioTrack) {
  audioTrack.onended = () => {
    console.warn("[call-service] Audio track ended — device disconnected?");
    // Попытка переполучить или уведомить пользователя
  };
}
```

**Проверка**: Отключить USB-микрофон → UI показывает предупреждение.

---

## P2 — Средние (edge cases и надёжность)

### 7. BroadcastChannel таймаут 300ms → 1000ms

**Проблема**: `checkOtherTabHasCall()` ждёт ответа от других табов 300мс. На загруженной системе таб может не успеть → дублирование звонков в нескольких табах.

**Файл**: `src/features/video-calls/model/call-tab-lock.ts` (строка 7)

**Действия**: `const TAB_CHECK_TIMEOUT = 1000;`

**Проверка**: 5 табов → входящий звонок → только один таб показывает модалку.

---

### 8. Множественные попытки ICE restart с backoff

**Проблема**: Сейчас один ICE restart, потом hangup через 30с. В нестабильных мобильных сетях одного restart может быть мало.

**Файл**: `call.ts`, `onIceConnectionStateChanged()`

**Действия**:
- Счётчик restart-попыток (макс 3)
- Exponential backoff: 2с → 4с → 8с
- После исчерпания — hangup с `CallErrorCode.IceFailed`

**Проверка**: В логах до 3 попыток ICE restart перед hangup.

---

### 9. Мониторинг качества через getStats()

**Проблема**: Нет информации о качестве соединения — ни для пользователя, ни для диагностики.

**Файл**: Новый `call-quality.ts` или расширение `call-service.ts`

**Действия**:
- Периодический опрос `peerConn.getStats()` каждые 5с
- Метрики: packet loss, jitter, RTT, available bandwidth
- UI-индикатор качества (зелёный/жёлтый/красный)

**Проверка**: Во время звонка виден индикатор; при деградации сети индикатор меняется.

---

## P3 — Низкий приоритет (оптимизации)

### 10. Баг scoping в evaluateEventBuffer

**Проблема**: В `callEventHandler.ts` (строка ~101-137) переменная `eventType` может ссылаться на scope внешнего цикла → пропуск валидных invite или неигнорирование отвеченных.

**Действия**: Проверить и исправить scope переменных во вложенных циклах.

---

### 11. Ускорение сигналинга (to-device messages)

**Проблема**: Matrix room events через /sync задерживаются на 1-5с. Для WebRTC это критично.

**Действия**: Исследовать использование to-device messages для m.call.* событий.

---

### 12. Fallback STUN-сервер

**Проблема**: Если TURN endpoint сервера недоступен, единственный fallback — встроенный в SDK.

**Файл**: `matrix-client.ts` (строка 184-186)

**Действия**: Добавить явный fallback:
```typescript
iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
```

---

## Порядок работы

```
Этап 1: TURN (#1)
  └── Серверная настройка, без изменений кода
  └── Ожидаемый эффект: +40-60% успешных звонков

Этап 2: SDK-фиксы (#2, #3, #4, #5)
  └── Форк matrix-js-sdk-bastyon
  └── Ожидаемый эффект: +20-30% успешных звонков

Этап 3: App-фиксы (#6, #7)
  └── new-bastyon-chat
  └── Ожидаемый эффект: устранение edge cases

Этап 4: Улучшения (#8-#12)
  └── Итеративно
  └── Ожидаемый эффект: повышение стабильности и UX
```

---

## Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `src/features/video-calls/model/call-service.ts` | Оркестрация звонков (762 строки) |
| `src/entities/call/model/call-store.ts` | Состояние звонка (Pinia, 179 строк) |
| `src/entities/call/model/types.ts` | TypeScript типы (CallInfo, CallStatus) |
| `src/entities/matrix/model/matrix-client.ts` | Matrix client config (ICE, VoIP) |
| `src/features/video-calls/model/call-tab-lock.ts` | Multi-tab lock (BroadcastChannel) |
| `src/features/video-calls/model/call-sounds.ts` | Рингтоны (Web Audio API) |
| `src/features/video-calls/ui/CallWindow.vue` | Основной UI звонка |
| `src/features/video-calls/ui/IncomingCallModal.vue` | Модалка входящего звонка |
| `src/shared/config/constants.ts` | RTC_WS_URL, MATRIX_SERVER |
| `matrix-js-sdk-bastyon/src/webrtc/call.ts` | SDK: RTCPeerConnection, ICE, negotiation |
| `matrix-js-sdk-bastyon/src/webrtc/callEventHandler.ts` | SDK: обработка m.call.* событий |

---

## Верификация (E2E)

После внедрения всех P0 и P1 исправлений:

1. **TURN**: chrome://webrtc-internals → relay candidates присутствуют
2. **ICE queuing**: Лог flush очереди после setRemoteDescription
3. **Impolite fix**: Mac→Mobile через WiFi↔4G → connected (не deadlock)
4. **Timer leak**: Нет лишних ICE restart после disconnected→connected
5. **Итоговый тест**: 10 звонков в каждом направлении (Mobile↔Mac, WiFi↔4G) → >90% успех

---

## Связанная документация

- [webrtc-architecture.md](./webrtc-architecture.md) — полная архитектура WebRTC в приложении
- [webrtc-calls-troubleshooting.md](./webrtc-calls-troubleshooting.md) — диагностика и отладка
- [webrtc-logs-analysis.md](./webrtc-logs-analysis.md) — анализ логов Mobile↔Mac
- [webrtc-solution-proposal.md](./webrtc-solution-proposal.md) — предложения от мультимодельного анализа
