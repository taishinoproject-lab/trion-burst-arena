import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../game/config';
import { BulletType } from '../game/constants';
import { MobileControls } from './MobileControls';
import { MobilePvpControls } from './MobilePvpControls';
import { MainScene } from '../game/scenes/MainScene';
import { PvpScene } from '../game/scenes/PvpScene';

interface TrionBattleGameProps {
  className?: string;
}

export const TrionBattleGame = ({ className }: TrionBattleGameProps) => {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<MainScene | null>(null);
  const pvpSceneRef = useRef<PvpScene | null>(null);
  const loadingLogoUrl = `${import.meta.env.BASE_URL}loading-logo.png`;
  const loadingCubeUrl = `${import.meta.env.BASE_URL}loading-cube.png`;
  const [deviceType, setDeviceType] = useState<'phone' | 'tablet' | 'desktop' | null>(null);
  const [mobileScale, setMobileScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [activeSceneKey, setActiveSceneKey] = useState('MainScene');
  const [isBattleActive, setIsBattleActive] = useState(false);
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [currentBulletType, setCurrentBulletType] = useState<BulletType | null>(null);
  const [pvpBulletTypes, setPvpBulletTypes] = useState<{ p1: BulletType | null; p2: BulletType | null }>({
    p1: null,
    p2: null,
  });
  const [pvpTrionStatus, setPvpTrionStatus] = useState<{ p1: number; p2: number; max: number } | null>(null);
  const [isPvpGameOver, setIsPvpGameOver] = useState(false);
  const [splashPhase, setSplashPhase] = useState<'logo' | 'loading' | 'ready'>('logo');
  const [loadingDelayDone, setLoadingDelayDone] = useState(false);
  const fullscreenAttemptedRef = useRef(false);
  const isMobile = deviceType === 'phone' || deviceType === 'tablet';
  const isMobileResolved = deviceType !== null;
  const showSplash = splashPhase !== 'ready';
  const showLogo = splashPhase === 'logo';
  const showLoading = splashPhase !== 'logo';

  useEffect(() => {
    const resolvePhoneScale = (aspect: number) => {
      if (aspect < 1.95) return 1.06; // 9:16 (~1.78)
      if (aspect < 2.2) return 1.04; // ~9:19.5 (~2.17)
      return 1.03; // 20:9 (~2.22)
    };

    // Detect mobile/touch device and distinguish phone/tablet by aspect ratio.
    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspect = Math.max(width, height) / Math.min(width, height);
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const isCompactViewport = window.matchMedia?.('(max-width: 1366px)').matches ?? width < 1366;
      const isTouchDevice = (hasTouch || hasCoarsePointer) && isCompactViewport;

      if (!isTouchDevice) {
        setDeviceType('desktop');
        return;
      }

      if (aspect <= 1.5) {
        setDeviceType('tablet');
        setMobileScale(1.02);
        return;
      }

      setDeviceType('phone');
      setMobileScale(resolvePhoneScale(aspect));
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  useEffect(() => {
    const logoTimer = window.setTimeout(() => {
      setSplashPhase('loading');
    }, 2000);
    return () => window.clearTimeout(logoTimer);
  }, []);

  useEffect(() => {
    if (splashPhase !== 'loading') {
      setLoadingDelayDone(false);
      return;
    }
    const loadingTimer = window.setTimeout(() => {
      setLoadingDelayDone(true);
    }, 2000);
    return () => window.clearTimeout(loadingTimer);
  }, [splashPhase]);

  useEffect(() => {
    if (isMobileResolved && splashPhase === 'loading' && loadingDelayDone) {
      setSplashPhase('ready');
    }
  }, [isMobileResolved, loadingDelayDone, splashPhase]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const requestFullscreenAndLandscape = useCallback(async () => {
    if (!fullscreenRef.current || !canFullscreen) return;
    if (!document.fullscreenElement) {
      await fullscreenRef.current.requestFullscreen().catch(() => {});
    }
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape').catch(() => {});
    }
  }, [canFullscreen]);

  const handleBattleStateChange = useCallback((active: boolean) => {
    setIsBattleActive(active);
  }, []);

  const handlePvpBulletChange = useCallback((payload: { player: 'p1' | 'p2'; bulletType: BulletType }) => {
    setPvpBulletTypes((prev) => ({
      ...prev,
      [payload.player]: payload.bulletType,
    }));
  }, []);

  const handlePvpTrionChange = useCallback((payload: { p1: number; p2: number; max: number }) => {
    setPvpTrionStatus(payload);
  }, []);

  useEffect(() => {
    if (!gameContainerRef.current || deviceType === null) return;
    
    // Destroy existing game if isMobile changed
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    }

    // Prevent context menu on right click (for Meteora firing)
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };
    gameContainerRef.current.addEventListener('contextmenu', handleContextMenu);

    // Create Phaser game instance with mobile scaling
    const scenes = [MainScene, PvpScene];
    const config = createGameConfig('game-container', isMobile, scenes);
    const gameInstance = new Phaser.Game(config);
    gameRef.current = gameInstance;

    const handleSceneStart = (scene: Phaser.Scene) => {
        setActiveSceneKey(scene.scene.key);
        if (scene.scene.key === 'MainScene') {
          const mainScene = scene as MainScene;
          if (pvpSceneRef.current) {
            pvpSceneRef.current.events.off('pvp-bullet-changed', handlePvpBulletChange);
            pvpSceneRef.current.events.off('pvp-trion-changed', handlePvpTrionChange);
          }
        mainScene.events.off('battle-state-changed', handleBattleStateChange);
        mainScene.events.on('battle-state-changed', handleBattleStateChange);
        mainScene.events.off('tutorial-state-changed');
        mainScene.events.on('tutorial-state-changed', setIsTutorialActive);
        mainScene.events.off('bullet-type-changed', setCurrentBulletType);
        mainScene.events.on('bullet-type-changed', setCurrentBulletType);
        setIsBattleActive(mainScene.isBattleActive());
        setIsTutorialActive(mainScene.isTutorialActive());
        setCurrentBulletType(mainScene.getCurrentBulletType());
        sceneRef.current = mainScene;
        pvpSceneRef.current = null;
        mainScene.setMobileMode(isMobile);
      } else {
        if (sceneRef.current) {
          sceneRef.current.events.off('battle-state-changed', handleBattleStateChange);
          sceneRef.current.events.off('tutorial-state-changed');
        }
        setIsBattleActive(false);
        setIsTutorialActive(false);
        setCurrentBulletType(null);
        setPvpBulletTypes({ p1: null, p2: null });
        setPvpTrionStatus(null);
        setIsPvpGameOver(false);
        sceneRef.current = null;
        if (scene.scene.key === 'PvpScene') {
          const pvpScene = scene as PvpScene;
          pvpScene.events.off('pvp-bullet-changed', handlePvpBulletChange);
          pvpScene.events.on('pvp-bullet-changed', handlePvpBulletChange);
          pvpScene.events.off('pvp-trion-changed', handlePvpTrionChange);
          pvpScene.events.on('pvp-trion-changed', handlePvpTrionChange);
          pvpScene.events.off('pvp-game-over');
          pvpScene.events.on('pvp-game-over', setIsPvpGameOver);
          setPvpBulletTypes({
            p1: pvpScene.getCurrentBulletType('p1'),
            p2: pvpScene.getCurrentBulletType('p2'),
          });
          setPvpTrionStatus(pvpScene.getTrionStatus());
          setIsPvpGameOver(false);
          pvpSceneRef.current = pvpScene;
        } else {
          pvpSceneRef.current = null;
        }
      }
    };
    const bindSceneStart = () => {
      gameInstance.scene.scenes.forEach((scene) => {
        scene.events.on(Phaser.Scenes.Events.START, () => handleSceneStart(scene));
      });
      gameInstance.scene.scenes.forEach((scene) => {
        if (scene.scene.isActive()) {
          handleSceneStart(scene);
        }
      });
    };
    if (gameInstance.scene && gameInstance.scene.scenes.length > 0) {
      bindSceneStart();
    } else {
      gameInstance.events.once(Phaser.Core.Events.READY, bindSceneStart);
    }

    return () => {
      gameContainerRef.current?.removeEventListener('contextmenu', handleContextMenu);
      if (gameRef.current) {
        gameInstance.events.off(Phaser.Core.Events.READY, bindSceneStart);
        gameInstance.scene?.scenes?.forEach((scene) => {
          scene.events.off(Phaser.Scenes.Events.START);
        });
        gameInstance.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [deviceType, handleBattleStateChange, isMobile]);

  const handleFullscreenToggle = useCallback(async () => {
    if (!fullscreenRef.current || !canFullscreen) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await requestFullscreenAndLandscape();
  }, [canFullscreen, requestFullscreenAndLandscape]);

  useEffect(() => {
    if (!isMobile || !canFullscreen) {
      fullscreenAttemptedRef.current = false;
      return;
    }
    if (splashPhase !== 'ready') return;

    const attemptFullscreen = () => {
      if (fullscreenAttemptedRef.current) return;
      fullscreenAttemptedRef.current = true;
      void requestFullscreenAndLandscape();
    };

    attemptFullscreen();
    window.addEventListener('touchstart', attemptFullscreen, { passive: true, once: true });
    window.addEventListener('pointerdown', attemptFullscreen, { passive: true, once: true });

    return () => {
      window.removeEventListener('touchstart', attemptFullscreen);
      window.removeEventListener('pointerdown', attemptFullscreen);
    };
  }, [canFullscreen, isMobile, requestFullscreenAndLandscape, splashPhase]);

  const handleMove = useCallback((x: number, y: number) => {
    if (sceneRef.current) {
      sceneRef.current.setMobileMove(x, y);
    }
  }, []);

  const handleAttack = useCallback((pressed: boolean) => {
    if (sceneRef.current) {
      sceneRef.current.setMobileAttack(pressed);
    }
  }, []);

  const handleCycleBullet = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.triggerCycleBullet();
    }
  }, []);

  const handleDelayToggle = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.triggerDelayToggle();
    }
  }, []);

  const handleShield = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.triggerShield(false);
    }
  }, []);

  const handleWideShield = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.triggerShield(true);
    }
  }, []);

  const handlePvpMove = useCallback((player: 'p1' | 'p2', x: number, y: number) => {
    if (pvpSceneRef.current) {
      pvpSceneRef.current.setMobileMove(player, x, y);
    }
  }, []);

  const handlePvpAttack = useCallback((player: 'p1' | 'p2', pressed: boolean) => {
    if (pvpSceneRef.current) {
      pvpSceneRef.current.setMobileAttack(player, pressed);
    }
  }, []);

  const handlePvpShield = useCallback((player: 'p1' | 'p2', wide: boolean) => {
    if (pvpSceneRef.current) {
      pvpSceneRef.current.triggerMobileShield(player, wide);
    }
  }, []);

  const handlePvpCycle = useCallback((player: 'p1' | 'p2') => {
    if (pvpSceneRef.current) {
      pvpSceneRef.current.triggerMobileCycleBullet(player);
    }
  }, []);

  const handlePvpDelayToggle = useCallback((player: 'p1' | 'p2') => {
    if (pvpSceneRef.current) {
      pvpSceneRef.current.triggerMobileDelayToggle(player);
    }
  }, []);

  const handlePvpRestart = useCallback(() => {
    pvpSceneRef.current?.scene.restart();
  }, []);

  const handlePvpBack = useCallback(() => {
    pvpSceneRef.current?.scene.start('MainScene', { instructionStartMode: 'twoPlayer' });
  }, []);

  return (
    <div
      ref={fullscreenRef}
      className={className}
      style={
        isMobile
          ? {
              width: '100dvw',
              height: '100dvh',
              position: 'fixed',
              top: 0,
              left: 0,
              paddingTop: 'env(safe-area-inset-top)',
              paddingRight: 'env(safe-area-inset-right)',
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingLeft: 'env(safe-area-inset-left)',
              boxSizing: 'border-box',
              background: 'radial-gradient(circle at top, rgba(0, 255, 213, 0.08), transparent 55%)',
            }
          : undefined
      }
    >
      <div
        id="game-container"
        ref={gameContainerRef}
        className={isMobile ? 'relative' : 'rounded-lg overflow-hidden shadow-xl border border-border/30'}
        style={{
          width: '100%',
          height: isMobile ? '100%' : 'auto',
          maxWidth: '100%',
          ...(isMobile
            ? {
                transform: `translateX(calc((env(safe-area-inset-right) - env(safe-area-inset-left)) / 2)) scale(${mobileScale})`,
                transformOrigin: 'center center',
              }
            : {
                aspectRatio: '16 / 9',
                maxHeight: 'calc(100dvh - 9rem)',
                maxWidth: 'calc((100dvh - 9rem) * 16 / 9)',
              }),
        }}
      />
      {isMobile && canFullscreen && (
        <button
          type="button"
          onClick={handleFullscreenToggle}
          className="fixed top-3 right-3 z-[60] rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide text-primary-foreground shadow-md"
          style={{
            background: 'linear-gradient(135deg, rgba(0, 255, 213, 0.85), rgba(0, 180, 150, 0.95))',
          }}
        >
          {isFullscreen ? '全画面解除' : '全画面'}
        </button>
      )}
      <MobileControls
        visible={isMobile && activeSceneKey === 'MainScene'}
        currentBulletType={currentBulletType ?? undefined}
        onMove={handleMove}
        onAttack={handleAttack}
        onCycleBullet={handleCycleBullet}
        onDelayToggle={handleDelayToggle}
        onShield={handleShield}
        onWideShield={handleWideShield}
      />
      <MobilePvpControls
        visible={isMobile && activeSceneKey === 'PvpScene' && !isPvpGameOver}
        onMove={handlePvpMove}
        onAttack={handlePvpAttack}
        onShield={handlePvpShield}
        onCycleBullet={handlePvpCycle}
        onDelayToggle={handlePvpDelayToggle}
        currentBulletType={pvpBulletTypes}
        trionStatus={pvpTrionStatus ?? undefined}
      />
      {isMobile && activeSceneKey === 'PvpScene' && isPvpGameOver && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex gap-4">
            <button
              type="button"
              onClick={handlePvpRestart}
              className="rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 255, 213, 0.95), rgba(0, 180, 150, 0.95))',
              }}
            >
              リスタート
            </button>
            <button
              type="button"
              onClick={handlePvpBack}
              className="rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 128, 128, 0.95), rgba(255, 90, 90, 0.95))',
              }}
            >
              戻る
            </button>
          </div>
        </div>
      )}
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black transition-opacity duration-500"
        style={{
          opacity: showSplash ? 1 : 0,
          pointerEvents: showSplash ? 'auto' : 'none',
        }}
        aria-hidden={!showSplash}
      >
        <div className="relative flex flex-col items-center justify-center gap-4 text-center text-white">
          <div
            className="flex flex-col items-center justify-center gap-4 transition-opacity duration-300"
            style={{ opacity: showLogo ? 1 : 0 }}
            aria-hidden={!showLogo}
          >
            <img src={loadingLogoUrl} alt="Trion Burst Arena" className="h-96 w-auto" />
          </div>
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 transition-opacity duration-300"
            style={{ opacity: showLoading ? 1 : 0 }}
            aria-hidden={!showLoading}
          >
            <img
              src={loadingCubeUrl}
              alt="Loading"
              className="h-32 w-32 animate-[spin_6s_linear_infinite]"
            />
            <p className="text-lg font-semibold tracking-[0.2em]">Loading...</p>
          </div>
        </div>
      </div>
    </div>
  );
};
