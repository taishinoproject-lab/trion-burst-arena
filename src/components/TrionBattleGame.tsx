import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../game/config';
import { MobileControls } from './MobileControls';
import { MainScene } from '../game/scenes/MainScene';

interface TrionBattleGameProps {
  className?: string;
}

export const TrionBattleGame = ({ className }: TrionBattleGameProps) => {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<MainScene | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile/touch device
    const checkMobile = () => {
      const mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(mobile && window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!gameContainerRef.current || gameRef.current) return;

    // Prevent context menu on right click (for Meteora firing)
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };
    gameContainerRef.current.addEventListener('contextmenu', handleContextMenu);

    // Create Phaser game instance
    const config = createGameConfig('game-container');
    gameRef.current = new Phaser.Game(config);

    // Get reference to MainScene when it's ready
    gameRef.current.events.on('ready', () => {
      const scene = gameRef.current?.scene.getScene('MainScene') as MainScene;
      if (scene) {
        sceneRef.current = scene;
      }
    });

    return () => {
      gameContainerRef.current?.removeEventListener('contextmenu', handleContextMenu);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, []);

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
    <div className={className}>
      <div
        id="game-container"
        ref={gameContainerRef}
        className="rounded-lg overflow-hidden shadow-xl border border-border/30"
        style={{ 
          width: isMobile ? '100vw' : '1280px', 
          height: isMobile ? '100vh' : '720px',
          maxWidth: '100%',
        }}
      />
      <MobileControls
        visible={isMobile}
        onMove={handleMove}
        onAttack={handleAttack}
        onCycleBullet={handleCycleBullet}
        onShield={handleShield}
        onWideShield={handleWideShield}
      />
    </div>
  );
};
