import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../game/config';

interface TrionBattleGameProps {
  className?: string;
}

export const TrionBattleGame = ({ className }: TrionBattleGameProps) => {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

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

    return () => {
      gameContainerRef.current?.removeEventListener('contextmenu', handleContextMenu);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div className={className}>
      <div
        id="game-container"
        ref={gameContainerRef}
        className="rounded-lg overflow-hidden shadow-xl border border-border/30"
        style={{ 
          width: '1280px', 
          height: '720px',
          maxWidth: '100%',
        }}
      />
    </div>
  );
};
