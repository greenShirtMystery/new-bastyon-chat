# WebRTC звонки — диагностика

## Цепочка соединения

1. **Исходящий звонок**: `startCall()` → `createNewMatrixCall(client, roomId)` → `call.placeVoiceCall()` / `placeVideoCall()` → SDK шлёт `m.call.invite` в комнату (или to-device).
2. **Входящий звонок**: сервер доставляет `m.call.invite` → SDK создаёт объект звонка и эмитит на клиенте событие `"Call.incoming"` → наш обработчик вызывает `handleIncomingCall()` → показ модалки и `answer()`.
3. **Соединение**: обмен SDP (offer/answer) и ICE-кандидатами через Matrix (room или to-device); при успехе состояние переходит в `Connected`.

## Возможные причины, почему звонки не соединяются

### 1. SDK не эмитит `Call.incoming` (входящие не приходят)

- В **matrix-js-sdk** (и ожидаемо в **matrix-js-sdk-bastyon**) событие `"Call.incoming"` выдаётся внутренним `CallEventHandler`, который подписывается на `m.call.invite` после синка.
- Если при создании клиента передаётся `disableVoip: true` (или по умолчанию в форке), то `CallEventHandler` не создаётся и входящие звонки не появятся.
- **Что сделано**: в опции создания клиента явно передаётся `disableVoip: false`.

### 2. Сервер не поддерживает или не проксирует VoIP-события

- События `m.call.invite`, `m.call.answer`, `m.call.candidates`, `m.call.hangup` должны доставляться сервером (room timeline и/или to-device).
- Если сервер matrix.pocketnet.app режет или не поддерживает эти типы событий, обмен SDP/ICE не завершится.
- **Проверка**: в консоли при исходящем звонке смотреть, уходит ли запрос и нет ли ошибок от API; на приёмной стороне — приходят ли в ленте события с типом `m.call.*`.

### 3. ICE/STUN/TURN

- В опциях клиента заданы `iceCandidatePoolSize: 20` и `fallbackICEServerAllowed: true`. TURN сервера SDK берёт через `client.getTurnServers()` (часто из `.well-known` сервера).
- Если оба абонента за симметричным NAT и TURN не настроен или недоступен, установка соединения может не пройти.
- **Идея на будущее**: при необходимости добавить запасной STUN (например `stun:stun.l.google.com:19302`) через опции клиента, если форк SDK это допускает.

### 4. `createNewMatrixCall` возвращает `null`

- В upstream это происходит, когда `supportsMatrixCall()` возвращает false (нет `RTCPeerConnection`/`getUserMedia` или не secure context).
- **Проверка**: открывать чат по HTTPS (или localhost); в консоли не должно быть сообщения `"createNewMatrixCall returned null"`.

### 5. Проверка поддержки VoIP в клиенте

- В коде используется `client.supportsVoip()` (или запасной вариант `canSupportVoip`). Если в форке метод отсутствует или возвращает false, раньше мы блокировали старт звонка; теперь при созданном объекте звонка делаем только предупреждение в консоль и всё равно пытаемся инициировать звонок.

## Что смотреть в консоли при отладке

- При **исходящем** звонке: `[call-service] supportsVoip: ...`, `[call-service] Starting ... call in room ...`, `[call-service] Call placed successfully` или текст ошибки из `placeVoiceCall`/`placeVideoCall`.
- При **входящем**: появляется ли лог `[call-service] Incoming call, callId=...` — если нет, то либо не приходит `m.call.invite`, либо SDK не эмитит `"Call.incoming"`.
- Состояние звонка: логи `[call-service] state: ... → ...` (ожидаем переход в `connected` при успехе).
- **Фаза соединения (WiFi ↔ 4G)**: логи `[call-service] connection phase: waiting for ICE/media`, `[call-service] peer connection created, ICE state: ...`, `[call-service] ICE connection state: ...`, `[call-service] ICE gathering state: ...`; при ошибке — `[call-service] call error: <code> <message>` (например `ice_failed` = нужен TURN).

### Звонок с телефона (4G) на компьютер (WiFi)

На компьютере открой DevTools (F12) → Console, очисти лог. Позвони с телефона, прими на компе. Смотри: если `ICE connection state` застревает на `checking` или переходит в `failed`, или есть `call error: ice_failed` — скорее всего нужен TURN. Сохрани вывод консоли для настройки TURN или отладки.

## Внесённые изменения в коде

- **matrix-client.ts**: в опции создания Matrix-клиента добавлено `disableVoip: false`.
- **call-service.ts**: проверка VoIP не блокирует звонок; добавлен fallback на `canSupportVoip`. Расширено логирование: фаза соединения (connection phase), детальный вывод ошибки (code/message), подписка на ICE-состояние peer connection для отладки WiFi↔4G.

Подробный разбор логов при звонках Mobile ↔ Mac (успех только Mobile→Mac, фейл Mac→Mobile из‑за ICE + «impolite»): см. **docs/webrtc-logs-analysis.md**.

---

## Чек-листы диагностики по сценариям (март 2026)

> Полный план исправлений: [webrtc-fix-plan.md](./webrtc-fix-plan.md)

### Сценарий A: Звонок не устанавливается (connecting → ended/failed)

```
□ 1. Открыть chrome://webrtc-internals на обеих сторонах
□ 2. Проверить наличие relay-кандидатов (Type: relay)
   └── Если нет → проблема TURN (см. чек-лист TURN ниже)
□ 3. Проверить ICE connection state в логах:
   └── "checking" → "failed" = нет пути между пирами, нужен TURN
   └── "checking" → "disconnected" → ICE restart → "ignoring colliding negotiate" = impolite deadlock (#3 в fix-plan)
   └── "checking" зависает = кандидаты не доходят (проблема сигналинга)
□ 4. Проверить в Network Tab: уходят ли m.call.invite / m.call.answer / m.call.candidates
   └── Если нет → проблема SDK или Matrix client
   └── Если уходят, но не приходят на другой стороне → проблема сервера
□ 5. Проверить консоль на ошибки:
   └── "createNewMatrixCall returned null" → не HTTPS или нет RTCPeerConnection
   └── "call error: ice_failed" → нужен TURN
   └── "InvalidStateError" при addIceCandidate → race condition кандидатов (#2 в fix-plan)
```

### Сценарий B: Звонок устанавливается, но обрывается

```
□ 1. Проверить логи ICE state transitions:
   └── connected → disconnected → "ICE restarting" → 2с → снова restart = утечка таймера (#4 в fix-plan)
   └── connected → failed = сеть упала, нужны множественные retry (#8 в fix-plan)
□ 2. Проверить track status:
   └── track.readyState === "ended" = устройство отключилось (#6 в fix-plan)
□ 3. Проверить peerConn.getStats() на packet loss / jitter
□ 4. Проверить не открыт ли звонок в нескольких табах (BroadcastChannel race)
```

### Сценарий C: Входящий звонок не появляется

```
□ 1. Проверить лог: есть ли "[call-service] Incoming call" ?
   └── Если нет → SDK не эмитит Call.incoming
□ 2. Проверить disableVoip в конфиге Matrix client (должен быть false)
□ 3. Проверить, что m.call.invite приходит в /sync ответе (Network Tab)
□ 4. Проверить callEventHandler.ts — evaluateEventBuffer может терять события (баг scoping #10)
□ 5. Проверить, что не сработал auto-reject другого таба (checkOtherTabHasCall)
```

### Сценарий D: Звонок Mac → Mobile всегда падает

```
□ 1. Это известная проблема: impolite deadlock (#3 в fix-plan)
□ 2. В логах Mac искать: "ignoring colliding negotiate event because we're impolite"
□ 3. Временный workaround: звонить с Mobile на Mac (Mobile = caller, Mac = answerer/polite)
□ 4. Постоянное решение: патч onNegotiateReceived() в matrix-js-sdk-bastyon
```

### Чек-лист проверки TURN

```
□ 1. Проверить TURN credentials от сервера:
   curl -H "Authorization: Bearer <TOKEN>" \
     https://matrix.pocketnet.app/_matrix/client/v3/voip/turnServer
   └── Ответ должен содержать uris, username, password
   └── uris должны включать и UDP и TCP транспорты
   └── uris должны включать turns: (TLS) для порта 443

□ 2. Проверить доступность coturn:
   turnutils_uclient -T -u <username> -w <password> <turn-host>

□ 3. Проверить порты (с внешней машины):
   nc -zvu <turn-host> 3478    # TURN UDP
   nc -zv <turn-host> 3478     # TURN TCP
   nc -zv <turn-host> 443      # TURNS TLS

□ 4. Проверить конфигурацию coturn:
   □ external-ip соответствует публичному IP
   □ static-auth-secret совпадает с turn_shared_secret в homeserver.yaml
   □ Relay ports (49152-65535) открыты на firewall
   □ TLS сертификаты актуальны
   □ Нет AAAA DNS записи (или IPv6 реально работает)
   □ coturn не за NAT (или корректный 1:1 NAT mapping)

□ 5. Проверить в chrome://webrtc-internals:
   □ Есть relay candidates в ICE candidates list
   □ Selected candidate pair использует relay (если P2P невозможен)
```
