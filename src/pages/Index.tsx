import { TrionBattleGame } from '@/components/TrionBattleGame';

const Index = () => {
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
      
      <main className="flex justify-center w-full">
        <TrionBattleGame />
      </main>
      
      <footer className="mt-4 text-xs text-muted-foreground text-center hidden md:block">
        <p>WASD: Move | Mouse: Aim | Left Click: Asteroid | Right Click: Meteora | Space: Shield | Q: Toggle Divide | R: Restart</p>
      </footer>
    </div>
  );
};

export default Index;
