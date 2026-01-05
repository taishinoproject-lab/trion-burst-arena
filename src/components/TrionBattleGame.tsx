import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../game/config';
import { MobileControls } from './MobileControls';
import { MainScene } from '../game/scenes/MainScene';
import { PvpScene } from '../game/scenes/PvpScene';

interface TrionBattleGameProps {
  className?: string;
}

export const TrionBattleGame = ({ className }: TrionBattleGameProps) => {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<MainScene | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [activeSceneKey, setActiveSceneKey] = useState('MainScene');
  const [isBattleActive, setIsBattleActive] = useState(false);

  useEffect(() => {
    // Detect mobile/touch device
    const checkMobile = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const isCompactViewport = window.matchMedia?.('(max-width: 1366px)').matches ?? window.innerWidth < 1366;
      setIsMobile((hasTouch || hasCoarsePointer) && isCompactViewport);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleBattleStateChange = useCallback((active: boolean) => {
    setIsBattleActive(active);
  }, []);

  useEffect(() => {
    if (!gameContainerRef.current) return;
    
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
        mainScene.events.off('battle-state-changed', handleBattleStateChange);
        mainScene.events.on('battle-state-changed', handleBattleStateChange);
        setIsBattleActive(mainScene.isBattleActive());
        sceneRef.current = mainScene;
        mainScene.setMobileMode(isMobile);
      } else {
        if (sceneRef.current) {
          sceneRef.current.events.off('battle-state-changed', handleBattleStateChange);
        }
        setIsBattleActive(false);
        sceneRef.current = null;
      }
    };
    const bindSceneStart = () => {
      gameInstance.scene.scenes.forEach((scene) => {
        scene.events.on(Phaser.Scenes.Events.START, () => handleSceneStart(scene));
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
  }, [handleBattleStateChange, isMobile]);

  const handleFullscreenToggle = useCallback(async () => {
    if (!gameContainerRef.current || !canFullscreen) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await gameContainerRef.current.requestFullscreen();
  }, [canFullscreen]);

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

  return (
    <div
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
            ? {}
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
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      )}
      <MobileControls
        visible={isMobile && activeSceneKey === 'MainScene' && isBattleActive}
        onMove={handleMove}
        onAttack={handleAttack}
        onCycleBullet={handleCycleBullet}
        onShield={handleShield}
        onWideShield={handleWideShield}
      />
    </div>
  );
};
