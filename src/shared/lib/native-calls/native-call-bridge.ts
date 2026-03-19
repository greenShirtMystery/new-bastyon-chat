import { registerPlugin } from '@capacitor/core';
import { isNative } from '@/shared/lib/platform';

interface NativeCallNativePlugin {
  reportIncomingCall(options: {
    callId: string;
    callerName: string;
    roomId: string;
    hasVideo: boolean;
  }): Promise<void>;
  reportCallEnded(options: { callId: string }): Promise<void>;
  addListener(event: 'callAnswered', cb: (data: { callId: string }) => void): Promise<{ remove: () => void }>;
  addListener(event: 'callDeclined', cb: (data: { callId: string }) => void): Promise<{ remove: () => void }>;
  addListener(event: 'callEnded', cb: (data: { callId: string }) => void): Promise<{ remove: () => void }>;
}

const NativeCall = registerPlugin<NativeCallNativePlugin>('NativeCall');

class NativeCallBridge {
  private callService: any = null;

  async wire(callService: { answerCall: () => void; rejectCall: () => void }): Promise<void> {
    if (!isNative) return;
    this.callService = callService;

    await NativeCall.addListener('callAnswered', ({ callId }) => {
      console.log('[NativeCallBridge] Call answered:', callId);
      this.callService?.answerCall();
    });

    await NativeCall.addListener('callDeclined', ({ callId }) => {
      console.log('[NativeCallBridge] Call declined:', callId);
      this.callService?.rejectCall();
    });

    await NativeCall.addListener('callEnded', ({ callId }) => {
      console.log('[NativeCallBridge] Call ended natively:', callId);
    });
  }

  async reportIncomingCall(options: {
    callId: string;
    callerName: string;
    roomId: string;
    hasVideo: boolean;
  }): Promise<void> {
    if (!isNative) return;
    await NativeCall.reportIncomingCall(options);
  }

  async reportCallEnded(callId: string): Promise<void> {
    if (!isNative) return;
    await NativeCall.reportCallEnded({ callId });
  }
}

export const nativeCallBridge = new NativeCallBridge();
