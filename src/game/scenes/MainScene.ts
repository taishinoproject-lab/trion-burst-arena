import Phaser from 'phaser';
import { GAME_CONFIG, BulletType, GameState } from '../constants';
import { Player } from '../entities/Player';
import { Boss } from '../entities/Boss';
import { Bullet } from '../entities/Bullet';
import { Shield } from '../entities/Shield';

export class MainScene extends Phaser.Scene {
  private player!: Player;
  private boss!: Boss;
  private playerBullets: Bullet[] = [];
  private bossBullets: Bullet[] = [];
  private playerShield: Shield | null = null;
  
  private gameState: GameState = {
    playerTrion: GAME_CONFIG.PLAYER_TRION_MAX,
    bossTrion: GAME_CONFIG.BOSS_TRION_MAX,
    currentBulletType: 'asteroid',
    divideEnabled: false,
    delayedAsteroidEnabled: false,
    isGameOver: false,
    playerWon: false,
  };
  
  // Input
  private lastFireTime: number = 0;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private qKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;
  private cKey!: Phaser.Input.Keyboard.Key;
  private fKey!: Phaser.Input.Keyboard.Key;
  private gKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  
  // UI Elements
  private playerTrionBar!: Phaser.GameObjects.Graphics;
  private bossTrionBar!: Phaser.GameObjects.Graphics;
  private playerTrionText!: Phaser.GameObjects.Text;
  private bossTrionText!: Phaser.GameObjects.Text;
  private bulletTypeText!: Phaser.GameObjects.Text;
  private delayedAsteroidText!: Phaser.GameObjects.Text;
  private divideText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private instructionsOverlay!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    // Background
    this.cameras.main.setBackgroundColor(GAME_CONFIG.BACKGROUND_COLOR);
    
    // Add grid pattern for visual interest
    this.createBackgroundGrid();
    
    // Create player
    this.player = new Player(this, GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT - 150);
    
    // Create boss
    this.boss = new Boss(this, GAME_CONFIG.WIDTH / 2, 180);
    
    // Setup input
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.qKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this.fKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.gKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    this.input.keyboard?.on('keydown-F', () => {
      if (this.gameState.isGameOver) return;
      this.releaseDividedAsteroids();
    });

    this.input.keyboard?.on('keydown-G', () => {
      if (this.gameState.isGameOver) return;
      this.releaseDividedAsteroids();
    });
    
    // Mouse input for shooting
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.gameState.isGameOver) return;
      
      if (pointer.rightButtonDown()) {
        this.gameState.currentBulletType = 'meteora';
      }

      if (pointer.middleButtonDown()) {
        this.releaseDividedAsteroids();
        return;
      }
      if (pointer.leftButtonDown()) {
        this.releaseDividedAsteroids();
      }
      // Viper fires on click (single shot guided)
      if (this.gameState.currentBulletType === 'viper') {
        this.tryFireBullet();
      } else {
        this.tryFireBullet();
      }
    });
    
    // Create UI
    this.createUI();
    
    // Show instructions briefly
    this.showInstructions();
    
    // Reset game state
    this.resetGameState();
  }

  private createBackgroundGrid() {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1a1a3a, 0.3);
    
    const gridSize = 60;
    for (let x = 0; x < GAME_CONFIG.WIDTH; x += gridSize) {
      graphics.moveTo(x, 0);
      graphics.lineTo(x, GAME_CONFIG.HEIGHT);
    }
    for (let y = 0; y < GAME_CONFIG.HEIGHT; y += gridSize) {
      graphics.moveTo(0, y);
      graphics.lineTo(GAME_CONFIG.WIDTH, y);
    }
    graphics.strokePath();
    graphics.setDepth(-10);
  }

  private createUI() {
    const uiY = 30;
    const barWidth = 250;
    const barHeight = 24;
    
    // Player Trion UI (left side)
    this.add.text(20, uiY - 8, 'PLAYER TRION', {
      fontSize: '14px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    
    this.playerTrionBar = this.add.graphics();
    this.playerTrionText = this.add.text(20 + barWidth + 10, uiY + 12, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    
    // Boss Trion UI (right side)
    this.add.text(GAME_CONFIG.WIDTH - 20 - barWidth, uiY - 8, 'BOSS TRION', {
      fontSize: '14px',
      color: '#ff6b6b',
      fontFamily: 'monospace',
    });
    
    this.bossTrionBar = this.add.graphics();
    this.bossTrionText = this.add.text(GAME_CONFIG.WIDTH - 20 - barWidth - 50, uiY + 12, '', {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    
    // Bottom UI - Bullet type and Divide status
    const bottomY = GAME_CONFIG.HEIGHT - 40;
    
    // Background panel for bottom UI
    const panel = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      bottomY,
      480,
      50,
      GAME_CONFIG.UI_BG_COLOR,
      0.8
    );
    panel.setStrokeStyle(1, GAME_CONFIG.BULLET_COLOR, 0.5);
    
    this.bulletTypeText = this.add.text(GAME_CONFIG.WIDTH / 2 - 180, bottomY - 10, '', {
      fontSize: '18px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    
    this.delayedAsteroidText = this.add.text(GAME_CONFIG.WIDTH / 2 - 10, bottomY - 10, '', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    
    this.divideText = this.add.text(GAME_CONFIG.WIDTH / 2 + 120, bottomY - 10, '', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    
    // Game over text (hidden initially)
    this.gameOverText = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2, '', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'monospace',
      align: 'center',
    });
    this.gameOverText.setOrigin(0.5);
    this.gameOverText.setVisible(false);
  }

  private showInstructions() {
    const bg = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2,
      500,
      350,
      0x0a0a12,
      0.95
    );
    bg.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    
    const title = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 - 130, '- TRION BATTLE -', {
      fontSize: '28px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    title.setOrigin(0.5);
    
    const instructions = `
WASD - Move
Mouse - Aim
Left Click - Fire
Right Click - Fire Meteora
Space - Deploy Narrow Shield
Shift + Space - Deploy Wide Shield
Q - Toggle Asteroid Delay Mode
C - Toggle Divide Mode
E - Switch Weapon (Asteroid/Meteora/Viper)
F/G - Release Divided Asteroids (Auto-Lock)
Middle Click - Release Divided Asteroids
R - Restart

Viper: Guide bullets with mouse!
Reduce Boss Trion to 0 to win!
    `.trim();
    
    const text = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + 20, instructions, {
      fontSize: '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
      align: 'center',
      lineSpacing: 6,
    });
    text.setOrigin(0.5);
    
    const startText = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2 + 150, 'Click to Start', {
      fontSize: '20px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    startText.setOrigin(0.5);
    
    // Blink effect
    this.tweens.add({
      targets: startText,
      alpha: 0.3,
      yoyo: true,
      repeat: -1,
      duration: 500,
    });
    
    this.instructionsOverlay = this.add.container(0, 0, [bg, title, text, startText]);
    this.instructionsOverlay.setDepth(100);
    
    // Hide on click
    this.input.once('pointerdown', () => {
      this.tweens.add({
        targets: this.instructionsOverlay,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.instructionsOverlay.destroy();
        },
      });
    });
  }

  private resetGameState() {
    this.gameState = {
      playerTrion: GAME_CONFIG.PLAYER_TRION_MAX,
      bossTrion: GAME_CONFIG.BOSS_TRION_MAX,
      currentBulletType: 'asteroid',
      divideEnabled: false,
      delayedAsteroidEnabled: false,
      isGameOver: false,
      playerWon: false,
    };
    this.gameOverText.setVisible(false);
  }

  update(time: number, delta: number) {
    if (this.gameState.isGameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
        this.scene.restart();
      }
      return;
    }
    
    // Handle restart
    if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
      this.scene.restart();
      return;
    }
    
    // Handle input
    this.handleInput();
    
    // Regenerate Trion
    this.regenerateTrion(delta);
    
    // Update entities
    this.player.update(delta);
    this.boss.update(delta, this.player.x, this.player.y, time);
    
    // Boss firing
    this.bossFire(time);
    
    // Update bullets
    this.updateBullets(delta);
    
    // Update shield
    if (this.playerShield?.active) {
      this.playerShield.update(this.player.x, this.player.y, this.player.angle);
    }
    
    // Check collisions
    this.checkCollisions();
    
    // Update UI
    this.updateUI();
    
    // Check win/lose conditions
    this.checkGameOver();
  }

  private handleInput() {
    // Toggle asteroid delay mode
    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
      this.gameState.delayedAsteroidEnabled = !this.gameState.delayedAsteroidEnabled;
    }

    // Toggle divide mode
    if (Phaser.Input.Keyboard.JustDown(this.cKey)) {
      this.gameState.divideEnabled = !this.gameState.divideEnabled;
    }
    
    // Switch bullet type (cycle through 3 types)
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      const types: Array<'asteroid' | 'meteora' | 'viper'> = ['asteroid', 'meteora', 'viper'];
      const currentIndex = types.indexOf(this.gameState.currentBulletType);
      this.gameState.currentBulletType = types[(currentIndex + 1) % types.length];
    }
    
    // Deploy shield
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.tryDeployShield();
    }

    // Release held divided asteroids
    if (Phaser.Input.Keyboard.JustDown(this.fKey)) {
      this.releaseDividedAsteroids();
    }

    if (Phaser.Input.Keyboard.JustDown(this.gKey)) {
      this.releaseDividedAsteroids();
    }
    
    // Continuous fire while holding (except for viper which fires on click)
    if (this.input.activePointer.isDown && !this.input.activePointer.rightButtonDown()) {
      if (this.gameState.currentBulletType !== 'viper') {
        this.tryFireBullet();
      }
    }
  }

  private tryFireBullet() {
    const now = this.time.now;
    const fireInterval = 1000 / GAME_CONFIG.FIRE_RATE;
    
    if (now - this.lastFireTime < fireInterval) return;
    
    const bulletType = this.gameState.currentBulletType;
    let cost: number;
    
    if (bulletType === 'asteroid') {
      cost = GAME_CONFIG.ASTEROID_COST;
      if (this.gameState.divideEnabled) {
        cost += GAME_CONFIG.ASTEROID_DIVIDE_EXTRA_COST;
      }
    } else if (bulletType === 'meteora') {
      cost = GAME_CONFIG.METEORA_COST;
    } else {
      cost = GAME_CONFIG.VIPER_COST;
    }
    
    // Check if enough Trion
    if (this.gameState.playerTrion < cost) return;
    
    // Consume Trion
    this.gameState.playerTrion -= cost;
    this.lastFireTime = now;
    
    const aim = this.player.getAimDirection();
    const baseAngle = Math.atan2(aim.y, aim.x);
    
    let bullet: Bullet;
    if (bulletType === 'asteroid') {
      if (this.gameState.divideEnabled) {
        // Create a single bullet that will split after traveling a short distance (World Trigger style)
        bullet = new Bullet(
          this,
          this.player.x + aim.x * 20,
          this.player.y + aim.y * 20,
          baseAngle,
          'asteroid',
          true,
          GAME_CONFIG.ASTEROID_DIVIDE_DAMAGE,
          GAME_CONFIG.BULLET_SPEED,
          true, // isDividing
          GAME_CONFIG.ASTEROID_DIVIDE_COUNT
        );
        // Register callback to add divided bullets to scene
        bullet.setOnDivide((newBullets) => {
          this.playerBullets.push(...newBullets);
        });
      } else {
        bullet = new Bullet(
          this,
          this.player.x + aim.x * 20,
          this.player.y + aim.y * 20,
          baseAngle,
          'asteroid',
          true,
          GAME_CONFIG.ASTEROID_DAMAGE
        );
      }
    } else if (bulletType === 'meteora') {
      bullet = new Bullet(
        this,
        this.player.x + aim.x * 20,
        this.player.y + aim.y * 20,
        baseAngle,
        'meteora',
        true,
        GAME_CONFIG.METEORA_DAMAGE
      );
    } else {
      // Viper - guided bullet
      bullet = new Bullet(
        this,
        this.player.x + aim.x * 20,
        this.player.y + aim.y * 20,
        baseAngle,
        'viper',
        true,
        GAME_CONFIG.VIPER_DAMAGE
      );
    }
    this.playerBullets.push(bullet);
    if (bulletType === 'asteroid' && this.gameState.delayedAsteroidEnabled && !this.gameState.divideEnabled) {
      this.scheduleDelayedRelease(bullet, () => ({ x: this.boss.x, y: this.boss.y }), 3000);
    }
  }

  private tryDeployShield() {
    // Check cooldown (only one shield at a time)
    if (this.playerShield?.active) return;
    
    // Check Trion
    if (this.gameState.playerTrion < GAME_CONFIG.SHIELD_COST) return;
    
    // Consume Trion
    this.gameState.playerTrion -= GAME_CONFIG.SHIELD_COST;
    
    const shieldType = this.shiftKey.isDown ? 'wide' : 'narrow';
    this.playerShield = new Shield(this, this.player.x, this.player.y, this.player.angle, shieldType, GAME_CONFIG.PLAYER_RADIUS);
  }

  private releaseDividedAsteroids() {
    this.scheduleHeldBulletRelease(this.playerBullets, () => ({ x: this.boss.x, y: this.boss.y }), 3000);
  }

  private scheduleDelayedRelease(
    bullet: Bullet,
    getTarget: () => { x: number; y: number },
    delayMs: number
  ) {
    if (!bullet.active || bullet.releaseScheduled) return;
    bullet.hold();
    bullet.releaseScheduled = true;
    this.time.delayedCall(delayMs, () => {
      if (!bullet.active || !bullet.isHeld) return;
      const target = getTarget();
      bullet.releaseTowards(target.x, target.y);
    });
  }

  private scheduleHeldBulletRelease(
    bullets: Bullet[],
    getTarget: () => { x: number; y: number },
    delayMs: number = 3000
  ) {
    for (const bullet of bullets) {
      if (!bullet.active || !bullet.isHeld || bullet.releaseScheduled) continue;
      bullet.releaseScheduled = true;
      this.time.delayedCall(delayMs, () => {
        if (!bullet.active || !bullet.isHeld) return;
        const target = getTarget();
        bullet.releaseTowards(target.x, target.y);
      });
    }
  }

  private bossFire(time: number) {
    const fireData = this.boss.fire(time);
    if (!fireData) return;

    const roll = Phaser.Math.FloatBetween(0, 1);
    const bulletType: BulletType = roll < 0.45 ? 'asteroid' : roll < 0.75 ? 'meteora' : 'viper';
    const useDelayedShot = Phaser.Math.FloatBetween(0, 1) < 0.3;

    if (bulletType === 'asteroid') {
      const shouldDivide = Phaser.Math.FloatBetween(0, 1) < 0.6;
      if (shouldDivide) {
        const bullet = new Bullet(
          this,
          fireData.x,
          fireData.y,
          fireData.angle,
          'asteroid',
          false,
          GAME_CONFIG.ASTEROID_DIVIDE_DAMAGE,
          GAME_CONFIG.BOSS_BULLET_SPEED,
          true,
          GAME_CONFIG.ASTEROID_DIVIDE_COUNT
        );
        bullet.setOnDivide((newBullets) => {
          this.bossBullets.push(...newBullets);
          this.scheduleHeldBulletRelease(newBullets, () => ({ x: this.player.x, y: this.player.y }));
        });
        this.bossBullets.push(bullet);
        return;
      }

      const bullet = new Bullet(
        this,
        fireData.x,
        fireData.y,
        fireData.angle,
        'asteroid',
        false,
        GAME_CONFIG.ASTEROID_DAMAGE,
        GAME_CONFIG.BOSS_BULLET_SPEED
      );
      this.bossBullets.push(bullet);
      if (useDelayedShot) {
        this.scheduleDelayedRelease(bullet, () => ({ x: this.player.x, y: this.player.y }), 3000);
      }
      return;
    }

    if (bulletType === 'meteora') {
      const bullet = new Bullet(
        this,
        fireData.x,
        fireData.y,
        fireData.angle,
        'meteora',
        false,
        GAME_CONFIG.METEORA_DAMAGE,
        GAME_CONFIG.BOSS_BULLET_SPEED
      );
      this.bossBullets.push(bullet);
      if (useDelayedShot) {
        this.scheduleDelayedRelease(bullet, () => ({ x: this.player.x, y: this.player.y }), 3000);
      }
      return;
    }

    const bullet = new Bullet(
      this,
      fireData.x,
      fireData.y,
      fireData.angle,
      'viper',
      false,
      GAME_CONFIG.VIPER_DAMAGE
    );
    this.bossBullets.push(bullet);
    if (useDelayedShot) {
      this.scheduleDelayedRelease(bullet, () => ({ x: this.player.x, y: this.player.y }), 3000);
    }
  }

  private updateBullets(delta: number) {
    const mouseX = this.input.activePointer.worldX;
    const mouseY = this.input.activePointer.worldY;
    
    // Update and clean up player bullets
    this.playerBullets = this.playerBullets.filter(bullet => {
      bullet.update(delta, mouseX, mouseY);
      return bullet.active;
    });
    
    // Update and clean up boss bullets (track player for viper guidance)
    this.bossBullets = this.bossBullets.filter(bullet => {
      bullet.update(delta, this.player.x, this.player.y);
      return bullet.active;
    });
  }

  private handleHeldBulletImpact(bulletA: Bullet, bulletB: Bullet): boolean {
    const hasHeld = bulletA.isHeld || bulletB.isHeld;
    if (!hasHeld) return false;

    bulletA.destroy();
    bulletB.destroy();
    return true;
  }

  private resolveBulletInterceptions() {
    for (const playerBullet of this.playerBullets) {
      if (!playerBullet.active) continue;
      const playerBounds = playerBullet.getBounds();

      for (const bossBullet of this.bossBullets) {
        if (!bossBullet.active) continue;
        const bossBounds = bossBullet.getBounds();

        if (Phaser.Geom.Intersects.CircleToCircle(playerBounds, bossBounds)) {
          if (this.handleHeldBulletImpact(playerBullet, bossBullet)) {
            this.createBulletClashEffect(playerBullet.x, playerBullet.y);
            this.playBulletClashSound();
            break;
          }
          if (playerBullet.type === 'meteora') {
            playerBullet.explode();
          } else {
            playerBullet.destroy();
          }
          bossBullet.destroy();
          this.createBulletClashEffect(playerBullet.x, playerBullet.y);
          this.playBulletClashSound();
          break;
        }
      }
    }
  }

  private resolveHeldBulletClashes(bullets: Bullet[]) {
    const heldBullets = bullets.filter(bullet => bullet.active && bullet.isHeld);
    if (heldBullets.length === 0) return;

    for (const bullet of bullets) {
      if (!bullet.active || bullet.isHeld) continue;
      const bulletBounds = bullet.getBounds();

      for (const heldBullet of heldBullets) {
        if (!heldBullet.active || heldBullet === bullet) continue;
        const heldBounds = heldBullet.getBounds();

        if (Phaser.Geom.Intersects.CircleToCircle(bulletBounds, heldBounds)) {
          if (!this.handleHeldBulletImpact(bullet, heldBullet)) {
            if (bullet.type === 'meteora') {
              bullet.explode();
            } else {
              bullet.destroy();
            }
            heldBullet.destroy();
          }
          this.createBulletClashEffect(bullet.x, bullet.y);
          this.playBulletClashSound();
          break;
        }
      }
    }
  }

  private createBulletClashEffect(x: number, y: number) {
    const core = this.add.circle(x, y, 8, 0xffffff, 0.9);
    core.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const ring = this.add.circle(x, y, 14, GAME_CONFIG.BOSS_BULLET_COLOR, 0.4);

    this.tweens.add({
      targets: [core, ring],
      alpha: 0,
      scale: 2.2,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        core.destroy();
        ring.destroy();
      },
    });
  }

  private playBulletClashSound() {
    const context = this.sound?.context;
    if (!context) return;
    if (context.state === 'suspended') {
      context.resume().catch(() => undefined);
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(720, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(260, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
  }

  private bulletHitsShield(bullet: Bullet, shield: Shield): boolean {
    const bulletBounds = bullet.getBounds();
    const shieldBounds = shield.getBounds();

    if (shieldBounds instanceof Phaser.Geom.Rectangle) {
      return Phaser.Geom.Intersects.CircleToRectangle(bulletBounds, shieldBounds);
    }

    return Phaser.Geom.Intersects.CircleToCircle(bulletBounds, shieldBounds);
  }

  private checkCollisions() {
    const bossRadius = GAME_CONFIG.BOSS_RADIUS;
    const playerRadius = GAME_CONFIG.PLAYER_RADIUS;

    this.resolveBulletInterceptions();
    this.resolveHeldBulletClashes(this.playerBullets);
    this.resolveHeldBulletClashes(this.bossBullets);
    
    // Player bullets vs Boss
    for (const bullet of this.playerBullets) {
      if (!bullet.active) continue;
      
      // Check boss shield first
      if (this.boss.shieldActive && this.boss.shield) {
        if (this.bulletHitsShield(bullet, this.boss.shield)) {
          if (bullet.type === 'meteora') {
            bullet.explode();
          } else {
            bullet.destroy();
          }
          this.boss.applyShieldDamage(bullet.damage);
          continue;
        }
      }
      
      // Check bullet vs boss
      const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, this.boss.x, this.boss.y);
      
      if (bullet.type === 'meteora') {
        // Meteora explodes on contact
        if (dist < bossRadius + GAME_CONFIG.BULLET_RADIUS) {
          bullet.explode();
          this.gameState.bossTrion -= bullet.damage;
        }
      } else {
        // Asteroid direct hit
        if (dist < bossRadius + GAME_CONFIG.BULLET_RADIUS) {
          this.gameState.bossTrion -= bullet.damage;
          bullet.destroy();
        }
      }
    }
    
    // Check Meteora explosions (area damage - already handled in explode)
    
    // Boss bullets vs Player
    for (const bullet of this.bossBullets) {
      if (!bullet.active) continue;
      
      // Check player shield
      if (this.playerShield?.active && this.playerShield) {
        if (this.bulletHitsShield(bullet, this.playerShield)) {
          if (bullet.type === 'meteora') {
            bullet.explode();
          } else {
            bullet.destroy();
          }
          this.playerShield.applyDamage(bullet.damage);
          continue;
        }
      }
      
      // Check bullet vs player
      const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, this.player.x, this.player.y);
      if (dist < playerRadius + GAME_CONFIG.BULLET_RADIUS) {
        this.gameState.playerTrion -= bullet.damage;
        bullet.destroy();
      }
    }
  }

  private regenerateTrion(delta: number) {
    const regenAmount = GAME_CONFIG.TRION_REGEN_RATE * (delta / 1000);
    
    this.gameState.playerTrion = Math.min(
      GAME_CONFIG.PLAYER_TRION_MAX,
      this.gameState.playerTrion + regenAmount
    );
    
    this.gameState.bossTrion = Math.min(
      GAME_CONFIG.BOSS_TRION_MAX,
      this.gameState.bossTrion + regenAmount
    );
  }

  private updateUI() {
    const barWidth = 250;
    const barHeight = 24;
    const uiY = 42;
    
    // Player Trion Bar
    this.playerTrionBar.clear();
    this.playerTrionBar.fillStyle(0x1a1a2e, 1);
    this.playerTrionBar.fillRect(20, uiY, barWidth, barHeight);
    
    const playerRatio = Math.max(0, this.gameState.playerTrion / GAME_CONFIG.PLAYER_TRION_MAX);
    this.playerTrionBar.fillStyle(GAME_CONFIG.BULLET_COLOR, 1);
    this.playerTrionBar.fillRect(20, uiY, barWidth * playerRatio, barHeight);
    
    this.playerTrionBar.lineStyle(2, 0x00ffd5, 0.5);
    this.playerTrionBar.strokeRect(20, uiY, barWidth, barHeight);
    
    this.playerTrionText.setText(`${Math.floor(this.gameState.playerTrion)}`);
    
    // Boss Trion Bar
    this.bossTrionBar.clear();
    this.bossTrionBar.fillStyle(0x1a1a2e, 1);
    this.bossTrionBar.fillRect(GAME_CONFIG.WIDTH - 20 - barWidth, uiY, barWidth, barHeight);
    
    const bossRatio = Math.max(0, this.gameState.bossTrion / GAME_CONFIG.BOSS_TRION_MAX);
    this.bossTrionBar.fillStyle(GAME_CONFIG.BOSS_COLOR, 1);
    this.bossTrionBar.fillRect(GAME_CONFIG.WIDTH - 20 - barWidth, uiY, barWidth * bossRatio, barHeight);
    
    this.bossTrionBar.lineStyle(2, 0xff6b6b, 0.5);
    this.bossTrionBar.strokeRect(GAME_CONFIG.WIDTH - 20 - barWidth, uiY, barWidth, barHeight);
    
    this.bossTrionText.setText(`${Math.floor(this.gameState.bossTrion)}`);
    
    // Bullet type display
    const bulletName = this.gameState.currentBulletType.toUpperCase();
    this.bulletTypeText.setText(`WEAPON: ${bulletName}`);

    const delayStatus = this.gameState.delayedAsteroidEnabled ? 'ON' : 'OFF';
    this.delayedAsteroidText.setText(`DELAY: ${delayStatus}`);
    this.delayedAsteroidText.setColor(this.gameState.delayedAsteroidEnabled ? '#00ffd5' : '#666666');
    
    // Divide status
    const divideStatus = this.gameState.divideEnabled ? 'ON' : 'OFF';
    this.divideText.setText(`DIVIDE: ${divideStatus}`);
    this.divideText.setColor(this.gameState.divideEnabled ? '#00ffd5' : '#666666');
  }

  private checkGameOver() {
    if (this.gameState.playerTrion <= 0) {
      this.gameState.isGameOver = true;
      this.gameState.playerWon = false;
      this.showGameOver('TRION DEPLETED\n\nYOU LOSE\n\nPress R to Restart');
    } else if (this.gameState.bossTrion <= 0) {
      this.gameState.isGameOver = true;
      this.gameState.playerWon = true;
      this.showGameOver('BOSS DEFEATED\n\nYOU WIN!\n\nPress R to Restart');
    }
  }

  private showGameOver(message: string) {
    this.gameOverText.setText(message);
    this.gameOverText.setVisible(true);
    this.gameOverText.setColor(this.gameState.playerWon ? '#00ffd5' : '#ff6b6b');
    
    // Add background
    const bg = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2,
      400,
      250,
      0x0a0a12,
      0.9
    );
    bg.setStrokeStyle(2, this.gameState.playerWon ? GAME_CONFIG.BULLET_COLOR : GAME_CONFIG.BOSS_COLOR);
    bg.setDepth(99);
    this.gameOverText.setDepth(100);
  }
}
