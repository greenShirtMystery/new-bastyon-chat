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
