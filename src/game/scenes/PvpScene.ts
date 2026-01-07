import Phaser from 'phaser';
import { AVAILABLE_BULLET_TYPES, BulletType, GAME_CONFIG } from '../constants';
import { Bullet } from '../entities/Bullet';
import { Shield, ShieldType } from '../entities/Shield';

type ViperPathOffset = { x: number; y: number };

class PvpFighter {
  private scene: Phaser.Scene;
  public sprite: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Arc;
  private aimIndicator: Phaser.GameObjects.Line;
  private slowIndicator: Phaser.GameObjects.Arc;
  public x: number;
  public y: number;
  public angle: number = 0;
  private slowUntil = 0;
  private slowStacks = 0;
  private slowStackMultiplier = 1;
  private freezeUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, color: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    this.body = scene.add.circle(0, 0, GAME_CONFIG.PLAYER_RADIUS, color);
    this.body.setStrokeStyle(2, 0xffffff, 0.5);

    this.aimIndicator = scene.add.line(0, 0, 0, 0, 40, 0, GAME_CONFIG.BULLET_COLOR, 0.6);
    this.aimIndicator.setLineWidth(2);

    const slowRadius = GAME_CONFIG.BULLET_RADIUS * 1.4;
    this.slowIndicator = scene.add.circle(0, 0, slowRadius, GAME_CONFIG.RED_BULLET_COLOR);
    this.slowIndicator.setStrokeStyle(1, GAME_CONFIG.RED_BULLET_STROKE_COLOR, 0.7);
    this.slowIndicator.setAlpha(0.9);
    this.slowIndicator.setVisible(false);

    this.sprite = scene.add.container(x, y, [this.body, this.aimIndicator, this.slowIndicator]);
  }

  updateMovement(delta: number, moveX: number, moveY: number) {
    const now = this.scene.time.now;
    if (now >= this.slowUntil && this.slowStacks > 0) {
      this.slowStacks = 0;
    }
    const slowActive = now < this.slowUntil && this.slowStacks > 0;
    if (this.slowIndicator.visible !== slowActive) {
      this.slowIndicator.setVisible(slowActive);
    }
    if (now < this.freezeUntil) {
      this.sprite.setPosition(this.x, this.y);
      return;
    }
    const speedMultiplier = this.getSpeedMultiplier(now);
    const speed = GAME_CONFIG.PLAYER_SPEED * speedMultiplier * (delta / 1000);

    this.x += moveX * speed;
    this.y += moveY * speed;

    const padding = GAME_CONFIG.PLAYER_RADIUS;
    this.x = Phaser.Math.Clamp(this.x, padding, GAME_CONFIG.WIDTH - padding);
    this.y = Phaser.Math.Clamp(this.y, padding + 80, GAME_CONFIG.HEIGHT - padding - 60);

    this.sprite.setPosition(this.x, this.y);
  }

  updateAim(targetX: number, targetY: number) {
    this.angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    this.aimIndicator.setTo(0, 0, Math.cos(this.angle) * 40, Math.sin(this.angle) * 40);
  }

  applySlow(durationMs: number, multiplier: number) {
    const now = this.scene.time.now;
    if (multiplier >= 1) {
      this.slowStacks = 0;
      this.slowUntil = 0;
      this.slowStackMultiplier = 1;
      return;
    }
    const isActive = now < this.slowUntil;
    this.slowStacks = isActive ? Math.min(this.slowStacks + 1, GAME_CONFIG.RED_BULLET_MAX_STACKS) : 1;
    this.slowUntil = now + durationMs;
    this.slowStackMultiplier = multiplier;
  }

  applyRedBulletHit(slowDurationMs: number, slowMultiplier: number, freezeDurationMs: number) {
    const now = this.scene.time.now;
    const slowActive = now < this.slowUntil && this.slowStacks > 0;
    if (slowActive) {
      this.freezeUntil = Math.max(this.freezeUntil, now + freezeDurationMs);
    }

    this.slowStacks = slowActive ? Math.min(this.slowStacks + 1, GAME_CONFIG.RED_BULLET_MAX_STACKS) : 1;
    this.slowUntil = now + slowDurationMs;
    this.slowStackMultiplier = slowMultiplier;
  }

  getBulletSpeedMultiplier(currentTime: number) {
    const stacks = this.getSlowStacks(currentTime);
    if (stacks === 0) return 1;
    return Math.pow(GAME_CONFIG.RED_BULLET_ENEMY_BULLET_SPEED_MULTIPLIER, stacks);
  }

  private getSlowStacks(currentTime: number) {
    return currentTime < this.slowUntil ? this.slowStacks : 0;
  }

  private getSpeedMultiplier(currentTime: number) {
    const stacks = this.getSlowStacks(currentTime);
    if (stacks === 0) return 1;
    return Math.pow(this.slowStackMultiplier, stacks);
  }

  destroy() {
    this.sprite.destroy();
  }
}

export class PvpScene extends Phaser.Scene {
  private player1!: PvpFighter;
  private player2!: PvpFighter;
  private player1Bullets: Bullet[] = [];
  private player2Bullets: Bullet[] = [];
  private player1Shield: Shield | null = null;
  private player2Shield: Shield | null = null;
  private player1Trion = GAME_CONFIG.PLAYER_TRION_MAX;
  private player2Trion = GAME_CONFIG.PLAYER_TRION_MAX;
  private player1BulletIndex = 0;
  private player2BulletIndex = 0;
  private playerBulletTypes: { p1: BulletType[]; p2: BulletType[] } = {
    p1: AVAILABLE_BULLET_TYPES.slice(0, 3),
    p2: AVAILABLE_BULLET_TYPES.slice(0, 3),
  };
  private gameOver = false;
  private winnerText!: Phaser.GameObjects.Text;
  private player1TrionBar!: Phaser.GameObjects.Graphics;
  private player2TrionBar!: Phaser.GameObjects.Graphics;
  private player1BulletText!: Phaser.GameObjects.Text;
  private player2BulletText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private backButton?: Phaser.GameObjects.Rectangle;
  private backButtonText?: Phaser.GameObjects.Text;
  private restartButton?: Phaser.GameObjects.Rectangle;
  private restartButtonText?: Phaser.GameObjects.Text;
  private gameOverBackButton?: Phaser.GameObjects.Rectangle;
  private gameOverBackText?: Phaser.GameObjects.Text;
  private damageTexts: Phaser.GameObjects.Text[] = [];
  private isMobileMode = false;
  private lastTrionEmit = { p1: -1, p2: -1 };

  private wKey!: Phaser.Input.Keyboard.Key;
  private aKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  private qKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private fKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private lKey!: Phaser.Input.Keyboard.Key;

  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private oKey!: Phaser.Input.Keyboard.Key;
  private pKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;

  private player1LastFireTime = 0;
  private player2LastFireTime = 0;
  private player2CyclePrev = false;
  private player2CycleNext = false;
  private player1DelayedAsteroidEnabled = false;
  private player2DelayedAsteroidEnabled = false;
  private player1ViperModeIndex = 0;
  private player2ViperModeIndex = 0;
  private viperPathOffsets: ViperPathOffset[][] = [
    [
      { x: 60, y: 0 },
      { x: 140, y: 0 },
      { x: 220, y: 0 },
      { x: 200, y: 0 },
      { x: 160, y: 0 },
    ],
    [
      { x: -60, y: 0 },
      { x: -140, y: 0 },
      { x: -220, y: 0 },
      { x: -200, y: 0 },
      { x: -160, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 140, y: 0 },
      { x: -80, y: 0 },
    ],
  ];
  private mobileInput = {
    p1: {
      moveX: 0,
      moveY: 0,
      attacking: false,
      shieldQueued: false,
      wideShieldQueued: false,
      cycleQueued: false,
    },
    p2: {
      moveX: 0,
      moveY: 0,
      attacking: false,
      shieldQueued: false,
      wideShieldQueued: false,
      cycleQueued: false,
    },
  };
  private aiEnabled = false;
  private aiInput = {
    moveX: 0,
    moveY: 0,
    attacking: false,
    shieldQueued: false,
    wideShieldQueued: false,
    cycleQueued: false,
    delayToggleQueued: false,
  };
  private aiTimers = {
    nextMoveUpdate: 0,
    nextAttackToggle: 0,
    nextShieldCheck: 0,
    nextCycleCheck: 0,
    nextDelayToggle: 0,
    nextTacticalDecision: 0,
  };
  private aiStrafeDirection = 1;
  private aiTactics = {
    desiredBullet: 'asteroid' as BulletType,
    desiredViperMode: 0,
    approachDistance: 300,
    retreatDistance: 190,
  };
  private static readonly TWO_PLAYER_RED_SLOW_DURATION = 10000;
  private static readonly TWO_PLAYER_RED_FREEZE_DURATION = 4000;
  constructor() {
    super({ key: 'PvpScene' });
  }

  init(data?: { p1BulletTypes?: BulletType[]; p2BulletTypes?: BulletType[]; aiEnabled?: boolean }) {
    const mobileFromRegistry = this.registry.get('isMobile');
    if (typeof mobileFromRegistry === 'boolean') {
      this.isMobileMode = mobileFromRegistry;
    }
    const normalizeSelection = (types?: BulletType[]) => {
      const unique = Array.from(new Set(types ?? []))
        .filter((type) => AVAILABLE_BULLET_TYPES.includes(type));
      const filled = [...unique];
      AVAILABLE_BULLET_TYPES.forEach((type) => {
        if (filled.length < 3 && !filled.includes(type)) {
          filled.push(type);
        }
      });
      return filled.slice(0, 3);
    };
    this.playerBulletTypes = {
      p1: normalizeSelection(data?.p1BulletTypes),
      p2: normalizeSelection(data?.p2BulletTypes),
    };
    this.aiEnabled = Boolean(data?.aiEnabled);
  }

  public setMobileMode(mobile: boolean) {
    this.isMobileMode = mobile;
  }

  public returnToSetup() {
    this.scene.start('MainScene', {
      instructionStartMode: 'twoPlayer',
      pvpSelectedBulletTypes: {
        p1: [...this.playerBulletTypes.p1],
        p2: [...this.playerBulletTypes.p2],
      },
      pvpAiEnabled: this.aiEnabled,
    });
  }

  private getBulletDisplayName(type: BulletType) {
    switch (type) {
      case 'asteroid':
        return 'アステロイド';
      case 'meteora':
        return 'メテオラ';
      case 'viper':
        return 'バイパー';
      case 'red':
        return 'レッドバレット';
      case 'hound':
        return 'ハウンド';
      default:
        return type;
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(GAME_CONFIG.BACKGROUND_COLOR);
    this.createBackgroundGrid();

    this.player1 = new PvpFighter(this, GAME_CONFIG.WIDTH * 0.3, GAME_CONFIG.HEIGHT * 0.7, GAME_CONFIG.PLAYER_COLOR);
    this.player2 = new PvpFighter(this, GAME_CONFIG.WIDTH * 0.7, GAME_CONFIG.HEIGHT * 0.3, GAME_CONFIG.BOSS_COLOR);

    this.player1Trion = GAME_CONFIG.PLAYER_TRION_MAX;
    this.player2Trion = GAME_CONFIG.PLAYER_TRION_MAX;
    this.player1BulletIndex = 0;
    this.player2BulletIndex = 0;
    this.player1Bullets = [];
    this.player2Bullets = [];
    this.player1Shield = null;
    this.player2Shield = null;
    this.gameOver = false;
    this.player1LastFireTime = 0;
    this.player2LastFireTime = 0;
    this.player1DelayedAsteroidEnabled = false;
    this.player2DelayedAsteroidEnabled = false;
    this.player1ViperModeIndex = 0;
    this.player2ViperModeIndex = 0;
    this.aiInput = {
      moveX: 0,
      moveY: 0,
      attacking: false,
      shieldQueued: false,
      wideShieldQueued: false,
      cycleQueued: false,
      delayToggleQueued: false,
    };
    this.aiTimers = {
      nextMoveUpdate: 0,
      nextAttackToggle: 0,
      nextShieldCheck: 0,
      nextCycleCheck: 0,
      nextDelayToggle: 0,
      nextTacticalDecision: 0,
    };
    this.aiStrafeDirection = 1;
    this.aiTactics = {
      desiredBullet: 'asteroid',
      desiredViperMode: 0,
      approachDistance: 300,
      retreatDistance: 190,
    };

    this.setupInput();
    this.createUI();
    this.emitBulletTypeChanged('p1');
    this.emitBulletTypeChanged('p2');
    this.events.emit('pvp-game-over', false);
  }

  update(_time: number, delta: number) {
    if (this.gameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
        this.returnToSetup();
      }
      return;
    }

    const player1Move = this.getPlayer1Movement();
    const player2Move = this.aiEnabled ? this.updateAiBehavior() : this.getPlayer2Movement();
    this.player1.updateMovement(delta, player1Move.x, player1Move.y);
    this.player2.updateMovement(delta, player2Move.x, player2Move.y);

    this.player1.updateAim(this.player2.x, this.player2.y);
    this.player2.updateAim(this.player1.x, this.player1.y);

    this.updateShields();
    this.handleInput();
    this.updateBullets(delta);
    this.checkCollisions();
    this.regenerateTrion(delta);
    this.updateUI();
  }

  public setMobileMove(player: 'p1' | 'p2', x: number, y: number) {
    this.mobileInput[player].moveX = x;
    this.mobileInput[player].moveY = y;
  }

  public setMobileAttack(player: 'p1' | 'p2', pressed: boolean) {
    this.mobileInput[player].attacking = pressed;
  }

  public triggerMobileShield(player: 'p1' | 'p2', wide: boolean) {
    if (wide) {
      this.mobileInput[player].wideShieldQueued = true;
      return;
    }
    this.mobileInput[player].shieldQueued = true;
  }

  public triggerMobileCycleBullet(player: 'p1' | 'p2') {
    this.mobileInput[player].cycleQueued = true;
  }

  public triggerMobileDelayToggle(player: 'p1' | 'p2') {
    const bulletType = this.getBulletTypeForPlayer(player);
    if (bulletType === 'viper') {
      this.cycleViperMode(player);
    } else if (bulletType === 'asteroid') {
      this.toggleDelayedAsteroidMode(player);
    }
  }

  public getCurrentBulletType(player: 'p1' | 'p2') {
    return this.getBulletTypeForPlayer(player);
  }

  private setupInput() {
    this.wKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.aKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.sKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.dKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.qKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.fKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.lKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L);

    this.cursorKeys = this.input.keyboard!.createCursorKeys();
    this.enterKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.oKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.O);
    this.pKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  }

  private createUI() {
    const isMobile = this.isMobileMode;
    const barWidth = isMobile ? 140 : 220;
    const barHeight = isMobile ? 12 : 16;
    const barY = isMobile ? 16 : 24;
    const barMarginX = isMobile ? 12 : 24;
    const labelFontSize = isMobile ? '10px' : '14px';
    const bulletFontSize = isMobile ? '10px' : '14px';
    
    const backButtonX = GAME_CONFIG.WIDTH / 2;
    const backButtonY = isMobile ? 28 : 36;
    const backButtonWidth = isMobile ? 140 : 160;
    const backButtonHeight = isMobile ? 40 : 44;
    const backButton = this.add.rectangle(
      backButtonX,
      backButtonY,
      backButtonWidth,
      backButtonHeight,
      0x1a1a3a,
      0.95
    );
    backButton.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const backText = this.add.text(backButtonX, backButtonY, '戻る', {
      fontFamily: 'Arial',
      fontSize: isMobile ? '14px' : '16px',
      color: '#ffffff',
    });
    backText.setOrigin(0.5);
    const handleBack = () => {
      this.returnToSetup();
    };
    backButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    backText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    this.backButton = backButton;
    this.backButtonText = backText;

    if (!isMobile) {
      this.add.text(barMarginX, barY - (isMobile ? 10 : 18), 'P1 トリオン', {
        fontFamily: 'Arial',
        fontSize: labelFontSize,
        color: '#00ffd5',
      });
      this.add.text(GAME_CONFIG.WIDTH - barMarginX - barWidth, barY - (isMobile ? 10 : 18), 'P2 トリオン', {
        fontFamily: 'Arial',
        fontSize: labelFontSize,
        color: '#ff6b6b',
      });
    }

    this.player1TrionBar = this.add.graphics();
    this.player2TrionBar = this.add.graphics();
    if (isMobile) {
      this.player1TrionBar.setVisible(false);
      this.player2TrionBar.setVisible(false);
    }

    this.player1BulletText = this.add.text(barMarginX, barY + barHeight + (isMobile ? 4 : 8), '', {
      fontFamily: 'Arial',
      fontSize: bulletFontSize,
      color: '#b6fff0',
    });
    this.player2BulletText = this.add.text(GAME_CONFIG.WIDTH - barMarginX, barY + barHeight + (isMobile ? 4 : 8), '', {
      fontFamily: 'Arial',
      fontSize: bulletFontSize,
      color: '#ffd0d0',
    }).setOrigin(1, 0);

    this.winnerText = this.add.text(GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2, '', {
      fontFamily: 'Arial',
      fontSize: isMobile ? '32px' : '48px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.instructionText = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT - (isMobile ? 20 : 32),
      'R: 設定に戻る',
      {
      fontFamily: 'Arial',
      fontSize: isMobile ? '10px' : '14px',
      color: '#6b7280',
      }
    ).setOrigin(0.5);

    const gameOverButtonWidth = isMobile ? 160 : 200;
    const gameOverButtonHeight = isMobile ? 46 : 54;
    const gameOverButtonY = GAME_CONFIG.HEIGHT / 2 + (isMobile ? 70 : 90);
    const gameOverButtonGap = isMobile ? 14 : 20;
    const gameOverLeftX = GAME_CONFIG.WIDTH / 2 - gameOverButtonWidth / 2 - gameOverButtonGap;
    const gameOverRightX = GAME_CONFIG.WIDTH / 2 + gameOverButtonWidth / 2 + gameOverButtonGap;

    const restartButton = this.add.rectangle(
      gameOverLeftX,
      gameOverButtonY,
      gameOverButtonWidth,
      gameOverButtonHeight,
      0x1a1a3a,
      0.95
    );
    restartButton.setStrokeStyle(2, 0x00ffd5, 0.8);
    const restartText = this.add.text(gameOverLeftX, gameOverButtonY, 'リスタート', {
      fontFamily: 'Arial',
      fontSize: isMobile ? '14px' : '16px',
      color: '#ffffff',
    });
    restartText.setOrigin(0.5);

    const backButtonOverlay = this.add.rectangle(
      gameOverRightX,
      gameOverButtonY,
      gameOverButtonWidth,
      gameOverButtonHeight,
      0x1a1a3a,
      0.95
    );
    backButtonOverlay.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const backOverlayText = this.add.text(gameOverRightX, gameOverButtonY, '戻る', {
      fontFamily: 'Arial',
      fontSize: isMobile ? '14px' : '16px',
      color: '#ffffff',
    });
    backOverlayText.setOrigin(0.5);

    const handleRestart = () => {
      this.returnToSetup();
    };
    restartButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleRestart);
    restartText.setInteractive({ useHandCursor: true }).on('pointerdown', handleRestart);
    backButtonOverlay.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    backOverlayText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);

    restartButton.setVisible(false);
    restartText.setVisible(false);
    backButtonOverlay.setVisible(false);
    backOverlayText.setVisible(false);
    this.restartButton = restartButton;
    this.restartButtonText = restartText;
    this.gameOverBackButton = backButtonOverlay;
    this.gameOverBackText = backOverlayText;

    this.updateUI();
  }

  private updateUI() {
    const isMobile = this.isMobileMode;
    const barWidth = isMobile ? 140 : 220;
    const barHeight = isMobile ? 12 : 16;
    const barY = isMobile ? 16 : 24;
    const barMarginX = isMobile ? 12 : 24;
    const player1Ratio = Math.max(0, this.player1Trion / GAME_CONFIG.PLAYER_TRION_MAX);
    const player2Ratio = Math.max(0, this.player2Trion / GAME_CONFIG.PLAYER_TRION_MAX);
    if (!isMobile) {
      this.player1TrionBar.clear();
      this.player1TrionBar.fillStyle(0x222233, 0.9);
      this.player1TrionBar.fillRoundedRect(barMarginX, barY, barWidth, barHeight, 6);
      this.player1TrionBar.fillStyle(0x00ffd5, 0.9);
      this.player1TrionBar.fillRoundedRect(barMarginX, barY, barWidth * player1Ratio, barHeight, 6);
      this.player1TrionBar.lineStyle(2, 0x00ffd5, 0.6);
      this.player1TrionBar.strokeRoundedRect(barMarginX, barY, barWidth, barHeight, 6);

      this.player2TrionBar.clear();
      this.player2TrionBar.fillStyle(0x222233, 0.9);
      this.player2TrionBar.fillRoundedRect(GAME_CONFIG.WIDTH - barMarginX - barWidth, barY, barWidth, barHeight, 6);
      this.player2TrionBar.fillStyle(0xff6b6b, 0.9);
      this.player2TrionBar.fillRoundedRect(
        GAME_CONFIG.WIDTH - barMarginX - barWidth,
        barY,
        barWidth * player2Ratio,
        barHeight,
        6
      );
      this.player2TrionBar.lineStyle(2, 0xff6b6b, 0.6);
      this.player2TrionBar.strokeRoundedRect(GAME_CONFIG.WIDTH - barMarginX - barWidth, barY, barWidth, barHeight, 6);
    }
    const p1Label = isMobile ? 'P1:' : 'P1 弾:';
    const p2Label = isMobile ? 'P2:' : 'P2 弾:';
    this.player1BulletText.setText(`${p1Label} ${this.getBulletDisplayName(this.getBulletTypeForPlayer('p1'))}`);
    this.player2BulletText.setText(`${p2Label} ${this.getBulletDisplayName(this.getBulletTypeForPlayer('p2'))}`);
    this.emitTrionStatus();
  }

  private emitTrionStatus() {
    const p1 = Math.max(0, this.player1Trion);
    const p2 = Math.max(0, this.player2Trion);
    const nextP1 = Math.round(p1);
    const nextP2 = Math.round(p2);
    if (nextP1 === this.lastTrionEmit.p1 && nextP2 === this.lastTrionEmit.p2) {
      return;
    }
    this.lastTrionEmit = { p1: nextP1, p2: nextP2 };
    this.events.emit('pvp-trion-changed', {
      p1: nextP1,
      p2: nextP2,
      max: GAME_CONFIG.PLAYER_TRION_MAX,
    });
  }

  public getTrionStatus() {
    return {
      p1: Math.max(0, Math.round(this.player1Trion)),
      p2: Math.max(0, Math.round(this.player2Trion)),
      max: GAME_CONFIG.PLAYER_TRION_MAX,
    };
  }

  private showGameOverButtons() {
    if (this.isMobileMode) {
      return;
    }
    this.restartButton?.setVisible(true);
    this.restartButtonText?.setVisible(true);
    this.gameOverBackButton?.setVisible(true);
    this.gameOverBackText?.setVisible(true);
  }

  private getPlayer1Movement() {
    let moveX = 0;
    let moveY = 0;
    if (this.aKey.isDown) moveX -= 1;
    if (this.dKey.isDown) moveX += 1;
    if (this.wKey.isDown) moveY -= 1;
    if (this.sKey.isDown) moveY += 1;
    if (moveX === 0 && moveY === 0) {
      moveX = this.mobileInput.p1.moveX;
      moveY = this.mobileInput.p1.moveY;
    }
    return { x: moveX, y: moveY };
  }

  private getPlayer2Movement() {
    let moveX = 0;
    let moveY = 0;
    if (this.cursorKeys.left?.isDown) moveX -= 1;
    if (this.cursorKeys.right?.isDown) moveX += 1;
    if (this.cursorKeys.up?.isDown) moveY -= 1;
    if (this.cursorKeys.down?.isDown) moveY += 1;
    if (moveX === 0 && moveY === 0) {
      moveX = this.mobileInput.p2.moveX;
      moveY = this.mobileInput.p2.moveY;
    }
    return { x: moveX, y: moveY };
  }

  private updateAiBehavior() {
    const now = this.time.now;
    const dx = this.player1.x - this.player2.x;
    const dy = this.player1.y - this.player2.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const trionRatio = this.player2Trion / GAME_CONFIG.PLAYER_TRION_MAX;
    const shield = this.player1Shield?.active ? this.player1Shield : null;
    const shieldType = shield?.type;
    const reserveTrion = GAME_CONFIG.SHIELD_COST + 5;

    if (now >= this.aiTimers.nextTacticalDecision) {
      let preferred: BulletType[] = ['asteroid', 'viper', 'hound', 'meteora', 'red'];
      let approachDistance = 300;
      let retreatDistance = 190;
      let desiredViperMode = 0;

      if (shieldType === 'wide') {
        preferred = ['meteora', 'asteroid', 'viper', 'hound', 'red'];
        approachDistance = 360;
        retreatDistance = 220;
      } else if (shieldType === 'narrow') {
        preferred = ['viper', 'asteroid', 'hound', 'meteora', 'red'];
        approachDistance = 320;
        retreatDistance = 190;
        desiredViperMode = this.aiStrafeDirection === 1 ? 1 : 2;
      } else if (distance < 240 && trionRatio > 0.35) {
        preferred = ['red', 'hound', 'asteroid', 'viper', 'meteora'];
        approachDistance = 240;
        retreatDistance = 150;
      } else {
        preferred = ['hound', 'asteroid', 'viper', 'meteora', 'red'];
        approachDistance = 320;
        retreatDistance = 200;
      }

      const desiredBullet = this.pickAffordableBulletType(preferred, reserveTrion);
      this.aiTactics = {
        desiredBullet,
        desiredViperMode,
        approachDistance,
        retreatDistance,
      };
      this.setPlayerBulletType('p2', desiredBullet);
      if (desiredBullet === 'viper') {
        this.setViperModeIndex('p2', desiredViperMode);
      } else {
        this.setViperModeIndex('p2', 0);
      }

      this.aiTimers.nextTacticalDecision = now + Phaser.Math.Between(520, 900);
    }

    if (now >= this.aiTimers.nextMoveUpdate) {
      const { approachDistance, retreatDistance } = this.aiTactics;
      let moveAngle = Math.atan2(dy, dx);

      if (distance < retreatDistance) {
        moveAngle += Math.PI;
      } else if (distance <= approachDistance) {
        this.aiStrafeDirection = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
        moveAngle += (Math.PI / 2) * this.aiStrafeDirection;
      }

      const moveX = Math.cos(moveAngle);
      const moveY = Math.sin(moveAngle);
      this.aiInput.moveX = Math.abs(moveX) < 0.15 ? 0 : Math.sign(moveX);
      this.aiInput.moveY = Math.abs(moveY) < 0.15 ? 0 : Math.sign(moveY);
      this.aiTimers.nextMoveUpdate = now + Phaser.Math.Between(260, 520);
    }

    if (now >= this.aiTimers.nextAttackToggle) {
      const inRange = distance < 450;
      const bulletCost = this.getBulletCost(this.aiTactics.desiredBullet);
      const canAffordShot = this.player2Trion >= bulletCost + reserveTrion;
      const aggression =
        trionRatio < 0.25 ? 0.1 : trionRatio < 0.4 ? 0.3 : trionRatio < 0.65 ? 0.55 : 0.75;
      const attackChance = (inRange ? 0.7 : 0.2) * aggression;
      this.aiInput.attacking = canAffordShot && Math.random() < attackChance;
      const baseMin = trionRatio < 0.4 ? 520 : 360;
      const baseMax = trionRatio < 0.4 ? 860 : 640;
      this.aiTimers.nextAttackToggle = now + Phaser.Math.Between(baseMin, baseMax);
    }

    if (now >= this.aiTimers.nextShieldCheck) {
      const shieldAvailable = !this.player2Shield?.active && this.player2Trion >= GAME_CONFIG.SHIELD_COST;
      const shouldShield =
        shieldAvailable &&
        (distance < 260 || this.player2Trion < GAME_CONFIG.PLAYER_TRION_MAX * 0.6) &&
        Math.random() < 0.35;
      if (shouldShield) {
        if (distance < 220 && Math.random() < 0.55) {
          this.aiInput.wideShieldQueued = true;
        } else {
          this.aiInput.shieldQueued = true;
        }
      }
      this.aiTimers.nextShieldCheck = now + Phaser.Math.Between(900, 1400);
    }

    this.aiInput.cycleQueued = false;
    this.aiInput.delayToggleQueued = false;

    return { x: this.aiInput.moveX, y: this.aiInput.moveY };
  }

  private handleInput() {
    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
      this.player1BulletIndex = this.getPrevBulletIndex(this.player1BulletIndex, 'p1');
      this.emitBulletTypeChanged('p1');
    }
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.player1BulletIndex = this.getNextBulletIndex(this.player1BulletIndex, 'p1');
      this.emitBulletTypeChanged('p1');
    }
    if (this.mobileInput.p1.cycleQueued) {
      this.player1BulletIndex = this.getNextBulletIndex(this.player1BulletIndex, 'p1');
      this.mobileInput.p1.cycleQueued = false;
      this.emitBulletTypeChanged('p1');
    }

    if (!this.aiEnabled) {
      if (Phaser.Input.Keyboard.JustDown(this.oKey)) {
        this.player2CyclePrev = true;
      }
      if (Phaser.Input.Keyboard.JustDown(this.pKey)) {
        this.player2CycleNext = true;
      }
      if (this.mobileInput.p2.cycleQueued) {
        this.player2BulletIndex = this.getNextBulletIndex(this.player2BulletIndex, 'p2');
        this.mobileInput.p2.cycleQueued = false;
        this.emitBulletTypeChanged('p2');
      }

      if (this.player2CyclePrev) {
        this.player2BulletIndex = this.getPrevBulletIndex(this.player2BulletIndex, 'p2');
        this.player2CyclePrev = false;
        this.emitBulletTypeChanged('p2');
      }
      if (this.player2CycleNext) {
        this.player2BulletIndex = this.getNextBulletIndex(this.player2BulletIndex, 'p2');
        this.player2CycleNext = false;
        this.emitBulletTypeChanged('p2');
      }
    } else if (this.aiInput.cycleQueued) {
      this.player2BulletIndex = this.getNextBulletIndex(this.player2BulletIndex, 'p2');
      this.aiInput.cycleQueued = false;
      this.emitBulletTypeChanged('p2');
    }

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      const shieldType: ShieldType = this.shiftKey.isDown ? 'wide' : 'narrow';
      this.tryDeployShield('p1', shieldType);
    }
    if (this.mobileInput.p1.shieldQueued) {
      this.tryDeployShield('p1', 'narrow');
      this.mobileInput.p1.shieldQueued = false;
    }
    if (this.mobileInput.p1.wideShieldQueued) {
      this.tryDeployShield('p1', 'wide');
      this.mobileInput.p1.wideShieldQueued = false;
    }

    if (!this.aiEnabled) {
      if (Phaser.Input.Keyboard.JustDown(this.shiftKey) && !this.spaceKey.isDown) {
        this.tryDeployShield('p2', 'narrow');
      }
      if (Phaser.Input.Keyboard.JustDown(this.lKey)) {
        this.tryDeployShield('p2', 'wide');
      }
      if (this.mobileInput.p2.shieldQueued) {
        this.tryDeployShield('p2', 'narrow');
        this.mobileInput.p2.shieldQueued = false;
      }
      if (this.mobileInput.p2.wideShieldQueued) {
        this.tryDeployShield('p2', 'wide');
        this.mobileInput.p2.wideShieldQueued = false;
      }
    } else {
      if (this.aiInput.shieldQueued) {
        this.tryDeployShield('p2', 'narrow');
        this.aiInput.shieldQueued = false;
      }
      if (this.aiInput.wideShieldQueued) {
        this.tryDeployShield('p2', 'wide');
        this.aiInput.wideShieldQueued = false;
      }
    }

    if (this.fKey.isDown) {
      this.tryFireBullet('p1');
    }
    if (!this.aiEnabled && this.enterKey.isDown) {
      this.tryFireBullet('p2');
    }
    if (this.mobileInput.p1.attacking) {
      this.tryFireBullet('p1');
    }
    if (!this.aiEnabled && this.mobileInput.p2.attacking) {
      this.tryFireBullet('p2');
    }
    if (this.aiEnabled && this.aiInput.attacking) {
      this.tryFireBullet('p2');
    }

    if (this.aiEnabled && this.aiInput.delayToggleQueued) {
      this.triggerMobileDelayToggle('p2');
      this.aiInput.delayToggleQueued = false;
    }
  }

  private tryDeployShield(player: 'p1' | 'p2', shieldType: ShieldType) {
    const shieldRef = player === 'p1' ? this.player1Shield : this.player2Shield;
    if (shieldRef?.active) return;

    if (player === 'p1') {
      if (this.player1Trion < GAME_CONFIG.SHIELD_COST) return;
      this.player1Trion -= GAME_CONFIG.SHIELD_COST;
      this.player1Shield = new Shield(this, this.player1.x, this.player1.y, this.player1.angle, shieldType, GAME_CONFIG.PLAYER_RADIUS);
    } else {
      if (this.player2Trion < GAME_CONFIG.SHIELD_COST) return;
      this.player2Trion -= GAME_CONFIG.SHIELD_COST;
      this.player2Shield = new Shield(this, this.player2.x, this.player2.y, this.player2.angle, shieldType, GAME_CONFIG.PLAYER_RADIUS);
    }
  }

  private updateShields() {
    if (this.player1Shield) {
      if (!this.player1Shield.active || !this.player1Shield.sprite.active) {
        this.player1Shield = null;
      } else {
        this.player1Shield.update(this.player1.x, this.player1.y, this.player1.angle);
      }
    }
    if (this.player2Shield) {
      if (!this.player2Shield.active || !this.player2Shield.sprite.active) {
        this.player2Shield = null;
      } else {
        this.player2Shield.update(this.player2.x, this.player2.y, this.player2.angle);
      }
    }
  }

  private tryFireBullet(player: 'p1' | 'p2') {
    const now = this.time.now;
    const fireInterval = 1000 / GAME_CONFIG.FIRE_RATE;
    const isPlayer1 = player === 'p1';
    const lastFireTime = isPlayer1 ? this.player1LastFireTime : this.player2LastFireTime;
    if (now - lastFireTime < fireInterval) return;

    const bulletIndex = isPlayer1 ? this.player1BulletIndex : this.player2BulletIndex;
    const bulletType = AVAILABLE_BULLET_TYPES[bulletIndex];
    const cost = this.getBulletCost(bulletType);
    const trion = isPlayer1 ? this.player1Trion : this.player2Trion;
    const delayedAsteroidEnabled = this.isDelayedAsteroidEnabled(player);

    if (trion < cost) return;

    if (isPlayer1) {
      this.player1Trion -= cost;
      this.player1LastFireTime = now;
    } else {
      this.player2Trion -= cost;
      this.player2LastFireTime = now;
    }

    const shooter = isPlayer1 ? this.player1 : this.player2;
    const target = isPlayer1 ? this.player2 : this.player1;
    const angle = Phaser.Math.Angle.Between(shooter.x, shooter.y, target.x, target.y);
    const aimX = Math.cos(angle);
    const aimY = Math.sin(angle);
    const bulletSpeedMultiplier = shooter.getBulletSpeedMultiplier(now);

    const { trionDamage, shieldDamage, speed } = this.getBulletStats(
      bulletType,
      bulletSpeedMultiplier,
      delayedAsteroidEnabled
    );
    const viperModeIndex = this.getViperModeIndex(player);
    const viperPath = bulletType === 'viper'
      ? this.buildViperPathPoints(
          shooter.x + aimX * 20,
          shooter.y + aimY * 20,
          angle,
          viperModeIndex
        )
      : undefined;
    const bullet = new Bullet(
      this,
      shooter.x + aimX * 20,
      shooter.y + aimY * 20,
      angle,
      bulletType,
      isPlayer1,
      trionDamage,
      shieldDamage,
      speed,
      viperPath,
      bulletType === 'viper' ? viperModeIndex : undefined
    );

    if (isPlayer1) {
      this.player1Bullets.push(bullet);
    } else {
      this.player2Bullets.push(bullet);
    }

    if (bulletType === 'asteroid' && delayedAsteroidEnabled) {
      this.scheduleDelayedRelease(bullet, () => ({ x: target.x, y: target.y }), 3000);
    }
  }

  private updateBullets(delta: number) {
    this.player1Bullets = this.player1Bullets.filter(bullet => {
      bullet.update(delta, this.player2.x, this.player2.y);
      return bullet.active;
    });
    this.player2Bullets = this.player2Bullets.filter(bullet => {
      bullet.update(delta, this.player1.x, this.player1.y);
      return bullet.active;
    });
  }

  private checkCollisions() {
    this.resolveBulletInterceptions();
    this.handleBulletHits(this.player1Bullets, this.player2, 'p2');
    this.handleBulletHits(this.player2Bullets, this.player1, 'p1');

    if (this.player1Trion <= 0 || this.player2Trion <= 0) {
      this.gameOver = true;
      const winner = this.player1Trion <= 0 ? 'P2 勝利' : 'P1 勝利';
      this.winnerText.setText(winner);
      this.showGameOverButtons();
      this.events.emit('pvp-game-over', true);
    }
  }

  private handleBulletHits(bullets: Bullet[], target: PvpFighter, targetId: 'p1' | 'p2') {
    const targetShield = targetId === 'p1' ? this.player1Shield : this.player2Shield;
    for (const bullet of bullets) {
      if (!bullet.active) continue;

      if (targetShield?.active && this.bulletHitsShield(bullet, targetShield)) {
        if (bullet.type === 'meteora') {
          this.triggerMeteoraExplosion(bullet, target, targetShield, targetId);
        } else {
          bullet.destroy();
          targetShield.applyDamage(bullet.shieldDamage);
        }
        continue;
      }

      const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, target.x, target.y);
      const bulletRadius = bullet.getBounds().radius;
      if (dist < GAME_CONFIG.PLAYER_RADIUS + bulletRadius) {
        if (bullet.type === 'meteora') {
          this.triggerMeteoraExplosion(bullet, target, targetShield, targetId);
        } else {
          this.applyBulletDamage(targetId, bullet);
          bullet.destroy();
        }
      }
    }
  }

  private triggerMeteoraExplosion(bullet: Bullet, target: PvpFighter, targetShield: Shield | null, targetId: 'p1' | 'p2') {
    const area = bullet.explode();
    if (!area) return;

    if (targetShield?.active && this.circleHitsShield(area, targetShield)) {
      targetShield.applyDamage(GAME_CONFIG.METEORA_SHIELD_DAMAGE);
      return;
    }

    const targetBounds = new Phaser.Geom.Circle(target.x, target.y, GAME_CONFIG.PLAYER_RADIUS);
    if (Phaser.Geom.Intersects.CircleToCircle(area, targetBounds)) {
      this.applyBulletDamage(targetId, bullet, true);
    }
  }

  private applyBulletDamage(targetId: 'p1' | 'p2', bullet: Bullet, isExplosion = false) {
    const damage = isExplosion ? GAME_CONFIG.METEORA_TRION_DAMAGE : bullet.trionDamage;
    if (targetId === 'p1') {
      this.player1Trion -= damage;
      this.showDamageNumber(this.player1.x, this.player1.y, damage, true);
      if (bullet.type === 'red') {
        this.player1.applyRedBulletHit(
          PvpScene.TWO_PLAYER_RED_SLOW_DURATION,
          GAME_CONFIG.RED_BULLET_SLOW_MULTIPLIER,
          PvpScene.TWO_PLAYER_RED_FREEZE_DURATION
        );
      }
    } else {
      this.player2Trion -= damage;
      this.showDamageNumber(this.player2.x, this.player2.y, damage, false);
      if (bullet.type === 'red') {
        this.player2.applyRedBulletHit(
          PvpScene.TWO_PLAYER_RED_SLOW_DURATION,
          GAME_CONFIG.RED_BULLET_SLOW_MULTIPLIER,
          PvpScene.TWO_PLAYER_RED_FREEZE_DURATION
        );
      }
    }
  }

  private resolveBulletInterceptions() {
    for (const player1Bullet of this.player1Bullets) {
      if (!player1Bullet.active) continue;
      if (player1Bullet.type === 'red') continue;
      const player1Bounds = player1Bullet.getBounds();

      for (const player2Bullet of this.player2Bullets) {
        if (!player2Bullet.active) continue;
        if (player2Bullet.type === 'red') continue;
        const player2Bounds = player2Bullet.getBounds();

        if (!Phaser.Geom.Intersects.CircleToCircle(player1Bounds, player2Bounds)) continue;

        if (player1Bullet.type === 'meteora') {
          const area = player1Bullet.explode();
          if (area) {
            this.applyMeteoraExplosionArea(area);
          }
        } else {
          player1Bullet.destroy();
        }

        if (player2Bullet.type === 'meteora') {
          const area = player2Bullet.explode();
          if (area) {
            this.applyMeteoraExplosionArea(area);
          }
        } else {
          player2Bullet.destroy();
        }
        break;
      }
    }
  }

  private applyMeteoraExplosionArea(area: Phaser.Geom.Circle) {
    const player1Shield = this.player1Shield;
    const player2Shield = this.player2Shield;

    if (player1Shield?.active && this.circleHitsShield(area, player1Shield)) {
      player1Shield.applyDamage(GAME_CONFIG.METEORA_SHIELD_DAMAGE);
    } else {
      const player1Bounds = new Phaser.Geom.Circle(this.player1.x, this.player1.y, GAME_CONFIG.PLAYER_RADIUS);
      if (Phaser.Geom.Intersects.CircleToCircle(area, player1Bounds)) {
        this.player1Trion -= GAME_CONFIG.METEORA_TRION_DAMAGE;
        this.showDamageNumber(this.player1.x, this.player1.y, GAME_CONFIG.METEORA_TRION_DAMAGE, true);
      }
    }

    if (player2Shield?.active && this.circleHitsShield(area, player2Shield)) {
      player2Shield.applyDamage(GAME_CONFIG.METEORA_SHIELD_DAMAGE);
    } else {
      const player2Bounds = new Phaser.Geom.Circle(this.player2.x, this.player2.y, GAME_CONFIG.PLAYER_RADIUS);
      if (Phaser.Geom.Intersects.CircleToCircle(area, player2Bounds)) {
        this.player2Trion -= GAME_CONFIG.METEORA_TRION_DAMAGE;
        this.showDamageNumber(this.player2.x, this.player2.y, GAME_CONFIG.METEORA_TRION_DAMAGE, false);
      }
    }
  }

  private showDamageNumber(x: number, y: number, damage: number, isPlayer1Damage: boolean) {
    const color = isPlayer1Damage ? '#ff6b6b' : '#00ffd5';
    const offsetX = Phaser.Math.Between(-20, 20);
    const offsetY = Phaser.Math.Between(-10, 10);

    const damageText = this.add.text(x + offsetX, y + offsetY, `-${Math.round(damage)}`, {
      fontSize: '22px',
      fontFamily: 'monospace',
      color: color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    });
    damageText.setOrigin(0.5, 0.5);
    damageText.setDepth(90);
    this.damageTexts.push(damageText);

    this.tweens.add({
      targets: damageText,
      y: damageText.y - 50,
      alpha: 0,
      scale: 1.2,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        const index = this.damageTexts.indexOf(damageText);
        if (index > -1) {
          this.damageTexts.splice(index, 1);
        }
        damageText.destroy();
      }
    });
  }

  private regenerateTrion(delta: number) {
    const regenAmount = GAME_CONFIG.TRION_REGEN_RATE * (delta / 1000);
    this.player1Trion = Math.min(GAME_CONFIG.PLAYER_TRION_MAX, this.player1Trion + regenAmount);
    this.player2Trion = Math.min(GAME_CONFIG.PLAYER_TRION_MAX, this.player2Trion + regenAmount);
  }

  private getBulletCost(bulletType: BulletType) {
    if (bulletType === 'asteroid') {
      return GAME_CONFIG.ASTEROID_COST;
    }
    if (bulletType === 'meteora') {
      return GAME_CONFIG.METEORA_COST;
    }
    if (bulletType === 'viper') {
      return GAME_CONFIG.VIPER_COST;
    }
    if (bulletType === 'hound') {
      return GAME_CONFIG.HOUND_COST;
    }
    return GAME_CONFIG.RED_BULLET_COST;
  }

  private getBulletStats(
    bulletType: BulletType,
    bulletSpeedMultiplier: number,
    delayedAsteroidEnabled: boolean
  ) {
    if (bulletType === 'asteroid') {
      return {
        trionDamage: delayedAsteroidEnabled
          ? GAME_CONFIG.ASTEROID_DELAY_TRION_DAMAGE
          : GAME_CONFIG.ASTEROID_TRION_DAMAGE,
        shieldDamage: GAME_CONFIG.ASTEROID_SHIELD_DAMAGE,
        speed:
          GAME_CONFIG.BULLET_SPEED *
          GAME_CONFIG.ASTEROID_SPEED_MULTIPLIER *
          bulletSpeedMultiplier,
      };
    }
    if (bulletType === 'meteora') {
      return {
        trionDamage: GAME_CONFIG.METEORA_TRION_DAMAGE,
        shieldDamage: GAME_CONFIG.METEORA_SHIELD_DAMAGE,
        speed: GAME_CONFIG.BULLET_SPEED * bulletSpeedMultiplier,
      };
    }
    if (bulletType === 'viper') {
      return {
        trionDamage: GAME_CONFIG.VIPER_TRION_DAMAGE,
        shieldDamage: GAME_CONFIG.VIPER_SHIELD_DAMAGE,
        speed: GAME_CONFIG.VIPER_SPEED * bulletSpeedMultiplier,
      };
    }
    if (bulletType === 'hound') {
      return {
        trionDamage: GAME_CONFIG.HOUND_TRION_DAMAGE,
        shieldDamage: GAME_CONFIG.HOUND_SHIELD_DAMAGE,
        speed: GAME_CONFIG.HOUND_SPEED * bulletSpeedMultiplier,
      };
    }
    return {
      trionDamage: GAME_CONFIG.RED_BULLET_TRION_DAMAGE,
      shieldDamage: GAME_CONFIG.RED_BULLET_SHIELD_DAMAGE,
      speed: GAME_CONFIG.RED_BULLET_SPEED * bulletSpeedMultiplier,
    };
  }

  private getNextBulletIndex(index: number, player: 'p1' | 'p2') {
    return (index + 1) % this.playerBulletTypes[player].length;
  }

  private getPrevBulletIndex(index: number, player: 'p1' | 'p2') {
    return (index - 1 + this.playerBulletTypes[player].length) % this.playerBulletTypes[player].length;
  }

  private emitBulletTypeChanged(player: 'p1' | 'p2') {
    this.events.emit('pvp-bullet-changed', {
      player,
      bulletType: this.getBulletTypeForPlayer(player),
    });
  }

  private getBulletTypeForPlayer(player: 'p1' | 'p2') {
    const index = player === 'p1' ? this.player1BulletIndex : this.player2BulletIndex;
    return this.playerBulletTypes[player][index] ?? AVAILABLE_BULLET_TYPES[0];
  }

  private pickAffordableBulletType(preferences: BulletType[], reserveTrion: number) {
    const available = this.playerBulletTypes.p2;
    const filtered = preferences.filter((type) => available.includes(type));
    const candidates = filtered.length > 0 ? filtered : available;
    const budget = Math.max(0, this.player2Trion - reserveTrion);
    const affordable = candidates.find((type) => this.getBulletCost(type) <= budget);
    if (affordable) return affordable;
    return candidates.reduce((best, current) => {
      return this.getBulletCost(current) < this.getBulletCost(best) ? current : best;
    }, candidates[0]);
  }

  private setPlayerBulletType(player: 'p1' | 'p2', bulletType: BulletType) {
    const index = this.playerBulletTypes[player].indexOf(bulletType);
    if (index === -1) return;
    if (player === 'p1') {
      if (this.player1BulletIndex !== index) {
        this.player1BulletIndex = index;
        this.emitBulletTypeChanged('p1');
      }
      return;
    }
    if (this.player2BulletIndex !== index) {
      this.player2BulletIndex = index;
      this.emitBulletTypeChanged('p2');
    }
  }

  private toggleDelayedAsteroidMode(player: 'p1' | 'p2') {
    if (player === 'p1') {
      this.player1DelayedAsteroidEnabled = !this.player1DelayedAsteroidEnabled;
      return;
    }
    this.player2DelayedAsteroidEnabled = !this.player2DelayedAsteroidEnabled;
  }

  private setViperModeIndex(player: 'p1' | 'p2', index: number) {
    const modeCount = this.viperPathOffsets.length;
    if (modeCount === 0) return;
    const normalized = ((index % modeCount) + modeCount) % modeCount;
    if (player === 'p1') {
      this.player1ViperModeIndex = normalized;
      return;
    }
    this.player2ViperModeIndex = normalized;
  }

  private cycleViperMode(player: 'p1' | 'p2') {
    const modeCount = this.viperPathOffsets.length;
    if (modeCount === 0) return;
    if (player === 'p1') {
      this.player1ViperModeIndex = (this.player1ViperModeIndex + 1) % modeCount;
      return;
    }
    this.player2ViperModeIndex = (this.player2ViperModeIndex + 1) % modeCount;
  }

  private getViperModeIndex(player: 'p1' | 'p2') {
    return player === 'p1' ? this.player1ViperModeIndex : this.player2ViperModeIndex;
  }

  private isDelayedAsteroidEnabled(player: 'p1' | 'p2') {
    return player === 'p1' ? this.player1DelayedAsteroidEnabled : this.player2DelayedAsteroidEnabled;
  }

  private buildViperPathPoints(startX: number, startY: number, angle: number, modeIndex: number) {
    const offsets = this.getViperPathOffsets(modeIndex);
    if (offsets.length === 0) return undefined;
    const segmentLength = GAME_CONFIG.VIPER_PATH_SEGMENT_LENGTH;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const perpX = -dirY;
    const perpY = dirX;
    const points: { x: number; y: number }[] = [];
    offsets.forEach((offset, index) => {
      const distance = segmentLength * (index + 1) + offset.y;
      points.push({
        x: startX + dirX * distance + perpX * offset.x,
        y: startY + dirY * distance + perpY * offset.x,
      });
    });
    return points;
  }

  private getViperPathOffsets(modeIndex: number) {
    const offsets = this.viperPathOffsets[modeIndex] ?? [];
    if (offsets.length === 0) return [];
    const normalized = Array.from({ length: 5 }, (_, index) => offsets[index] ?? { x: 0, y: 0 });
    return normalized.map((offset) => ({ x: offset.x ?? 0, y: offset.y ?? 0 }));
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

  private bulletHitsShield(bullet: Bullet, shield: Shield): boolean {
    if (bullet.ignoreShield) return false;
    const bulletBounds = bullet.getBounds();
    const shieldBounds = shield.getBounds();

    if (shieldBounds instanceof Phaser.Geom.Rectangle) {
      return Phaser.Geom.Intersects.CircleToRectangle(bulletBounds, shieldBounds);
    }

    return Phaser.Geom.Intersects.CircleToCircle(bulletBounds, shieldBounds);
  }

  private circleHitsShield(area: Phaser.Geom.Circle, shield: Shield): boolean {
    const shieldBounds = shield.getBounds();

    if (shieldBounds instanceof Phaser.Geom.Rectangle) {
      return Phaser.Geom.Intersects.CircleToRectangle(area, shieldBounds);
    }

    return Phaser.Geom.Intersects.CircleToCircle(area, shieldBounds);
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
}
