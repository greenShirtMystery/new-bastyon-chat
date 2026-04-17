export {};

declare global {
  interface Window {
    cordova?: {
      plugins: {
        torRunner: TorRunnerPlugin;
      };
    };
  }
}

interface TorRunnerPlugin {
  isUseWithTor(
    address: string,
    success: (result: { redirect: boolean; port: number }) => void,
    error: (err: string) => void
  ): void;

  configure(options: Partial<TorSettings>): void;

  getSettings(): TorSettings;

  Bridge: {
    NONE: "NONE";
    VANILLA: "VANILLA";
    OBFS3: "OBFS3";
    OBFS4: "OBFS4";
    MEEK_LITE: "MEEK_LITE";
    SNOWFLAKE: "SNOWFLAKE";
    WEBTUNNEL: "WEBTUNNEL";
  };

  TorMode: {
    UNDEFINED: 'UNDEFINED';
    NEVER: "NEVER";
    ALWAYS: "ALWAYS";
    AUTO: "AUTO";
  };

  TorStatus: {
    STOPPED: "STOPPED";
    STARTING: "STARTING";
    RUNNING: "RUNNING";
  };
}

export interface TorSettings {
  torMode: TorRunnerPlugin['TorMode'][keyof TorRunnerPlugin['TorMode']];
  torPort: number;
  bridgeType: TorRunnerPlugin['Bridge'][keyof TorRunnerPlugin['Bridge']];
  torState: TorRunnerPlugin['TorStatus'][keyof TorRunnerPlugin['TorStatus']];
}

