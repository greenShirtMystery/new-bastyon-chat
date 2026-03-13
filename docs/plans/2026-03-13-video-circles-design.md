# Video Circles (Видеокружки) — Design Document

## Overview
Добавить видеокружки (video notes) в чат — аналог функционала Telegram. Круглые видеосообщения длительностью до 60 секунд, записанные с фронтальной камеры.

## UX Flow (как в Telegram)

### Запись
1. Рядом с кнопкой микрофона — переключатель режима (микрофон ↔ камера)
2. Тап на иконку камеры переключает режим ввода на "видеокружок"
3. В режиме камеры:
   - **Mobile**: hold to record, swipe up = lock (hands-free), swipe left = cancel
   - **Desktop**: click = start + lock (hands-free)
4. Во время записи — круглое превью с камеры, таймер, max 60 сек
5. Locked mode — кнопки: отправить, превью, отмена
6. Preview mode — воспроизведение записанного, кнопки: отправить, удалить

### Отображение в чате
1. Круглое видео (240x240 на мобильном, 300x300 на десктопе)
2. Прогресс-кольцо вокруг видео (как в Telegram)
3. Автоплей при скролле в viewport (muted)
4. Тап/клик — play/pause с звуком
5. Длительность в углу
6. Без пузыря — видеокружок отображается как standalone элемент

## Технический дизайн

### Matrix Protocol
- msgtype: `m.video`
- Маркер видеокружка: `info.videoNote: true` (кастомное поле)
- Формат: WebM (VP8/VP9 + Opus) — нативная поддержка MediaRecorder
- Thumbnail: первый кадр, загружается отдельно

### Новые типы данных

```typescript
// types.ts — добавить в MessageType enum
videoCircle = "videoCircle"

// FileInfo — добавить поле
videoNote?: boolean;  // маркер видеокружка
thumbnailUrl?: string; // URL превью-кадра
```

### Новые файлы

1. **`src/features/messaging/model/use-video-circle-recorder.ts`**
   - States: `idle | recording | locked | preview`
   - getUserMedia({ video: { facingMode: "user", width: 480, height: 480 }, audio: true })
   - MediaRecorder API (WebM/VP9 + Opus)
   - Max duration: 60 sec (auto-stop)
   - Returns: { file: File, duration: number, thumbnailBlob: Blob }

2. **`src/features/messaging/ui/VideoCircleRecorder.vue`**
   - Круглое превью камеры (clip-path: circle)
   - Прогресс-кольцо (SVG circle с stroke-dashoffset)
   - Таймер
   - Кнопки: отправить (check), отмена (X), lock indicator
   - Жесты: swipe up = lock, swipe left = cancel (mobile)

3. **`src/features/messaging/ui/VideoCirclePlayer.vue`**
   - Круглое видео (object-fit: cover, clip-path: circle)
   - Прогресс-кольцо (SVG)
   - Play/pause overlay
   - Muted autoplay в viewport (IntersectionObserver)
   - Длительность badge
   - Loading state с thumbnail

### Изменения в существующих файлах

4. **`src/entities/chat/model/types.ts`**
   - `MessageType.videoCircle`

5. **`src/entities/chat/lib/chat-helpers.ts`**
   - Распознавание m.video + info.videoNote → MessageType.videoCircle

6. **`src/features/messaging/model/use-messages.ts`**
   - `sendVideoCircle(file, duration, thumbnailBlob)` — upload + send m.video event

7. **`src/features/messaging/ui/MessageInput.vue`**
   - Переключатель mic ↔ camera
   - Интеграция VideoCircleRecorder

8. **`src/features/messaging/ui/MessageBubble.vue`**
   - Рендеринг MessageType.videoCircle через VideoCirclePlayer

## Ограничения
- Max 60 секунд записи
- Фронтальная камера по умолчанию
- WebM формат (поддерживается всеми современными браузерами)
- Размер видео: 480x480 capture, отображение 240-300px
