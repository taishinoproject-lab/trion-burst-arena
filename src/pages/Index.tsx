import { useState } from 'react';
import { TrionBattleGame } from '@/components/TrionBattleGame';

const Index = () => {
  const [mode, setMode] = useState<'boss' | 'pvp'>('boss');

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center bg-background overflow-hidden md:overflow-visible md:p-4">
      <header className="mb-4 text-center hidden md:block">
        <h1 className="text-3xl font-bold text-primary tracking-wide">
          TRION BATTLE
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          World Trigger-Inspired Combat Prototype
        </p>
      </header>

      <div className="mb-4 hidden md:flex items-center gap-2 rounded-full border border-border/40 bg-card/70 px-2 py-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMode('boss')}
          className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            mode === 'boss'
              ? 'rounded-full bg-primary text-primary-foreground shadow'
              : 'text-muted-foreground'
          }`}
        >
          Boss
        </button>
        <button
          type="button"
          onClick={() => setMode('pvp')}
          className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
            mode === 'pvp'
              ? 'rounded-full bg-primary text-primary-foreground shadow'
              : 'text-muted-foreground'
          }`}
        >
          PvP
        </button>
      </div>
      
      <main className="flex justify-center w-full">
        <TrionBattleGame mode={mode} />
      </main>
      
      <footer className="mt-4 text-xs text-muted-foreground text-center hidden md:block">
        {mode === 'boss' ? (
          <p>WASD: Move | Mouse: Aim | Left Click: Fire | E: Cycle Weapon | Q: Delay Asteroid | Space: Shield | R: Restart</p>
        ) : (
          <p>
            P1: WASD Move, F Fire, Q/E Cycle, Shift/Space Shield | P2: Arrows Move, Enter Fire,
            め/ろ (or O/P) Cycle, Ctrl Shield | R: Restart
          </p>
        )}
      </footer>
    </div>
  );
};

export default Index;
