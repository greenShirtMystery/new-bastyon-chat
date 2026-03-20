import { isNative } from '@/shared/lib/platform';
import { useToast } from '@/shared/lib/use-toast';
import { useI18n } from 'vue-i18n';

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
  /** File URIs — native only. Use @capacitor/filesystem to get URI. */
  files?: string[];
}

export interface ShareResult {
  shared: boolean;
  fallback: boolean;
}

export function useNativeShare() {
  const { toast } = useToast();
  const { t } = useI18n();

  async function share(payload: SharePayload): Promise<ShareResult> {
    if (isNative) {
      return shareNative(payload);
    }
    if (navigator.share) {
      return shareWeb(payload);
    }
    return shareFallback(payload);
  }

  async function shareNative(payload: SharePayload): Promise<ShareResult> {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
        files: payload.files,
      });
      return { shared: true, fallback: false };
    } catch (e: any) {
      if (isCancelError(e)) {
        return { shared: false, fallback: false };
      }
      console.error('[useNativeShare] native share failed:', e);
      return shareFallback(payload);
    }
  }

  async function shareWeb(payload: SharePayload): Promise<ShareResult> {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
      });
      return { shared: true, fallback: false };
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return { shared: false, fallback: false };
      }
      console.error('[useNativeShare] web share failed:', e);
      return shareFallback(payload);
    }
  }

  async function shareFallback(payload: SharePayload): Promise<ShareResult> {
    const content = payload.url || payload.text || '';
    if (!content) {
      return { shared: false, fallback: true };
    }
    try {
      await navigator.clipboard.writeText(content);
      toast(t('share.linkCopied'), 'success');
    } catch {
      toast(t('share.copyFailed'), 'error');
    }
    return { shared: false, fallback: true };
  }

  return { share };
}

function isCancelError(e: any): boolean {
  if (!e) return false;
  const msg = (e.message || e.errorMessage || '').toLowerCase();
  return (
    msg.includes('cancel') ||
    msg.includes('dismiss') ||
    msg.includes('user denied') ||
    e.code === 'ERR_CANCELED'
  );
}
