export function loadScript(src: string, timeoutMs = 15_000): Promise<HTMLScriptElement> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    const timer = setTimeout(() => {
      script.remove();
      reject(new Error(`Script load timeout (${timeoutMs}ms): ${src}`));
    }, timeoutMs);

    script.onload = () => { clearTimeout(timer); resolve(script); };
    script.onerror = () => { clearTimeout(timer); reject(new Error(`Failed to load script ${src}`)); };
    document.head.appendChild(script);
  });
}
