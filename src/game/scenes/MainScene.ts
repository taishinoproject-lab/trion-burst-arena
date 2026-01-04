import Phaser from 'phaser';
import { AVAILABLE_BULLET_TYPES, DIFFICULTY_DAMAGE_MULTIPLIER, Difficulty, GAME_CONFIG, BulletType, GameState } from '../constants';
import { Player } from '../entities/Player';
import { Boss, BossConfig } from '../entities/Boss';
import { Bullet } from '../entities/Bullet';
import { Shield } from '../entities/Shield';

type EnemyPattern = 'mixed' | 'delayedAsteroid' | 'meteoraBarrage';

interface EnemyBehavior {
  pattern: EnemyPattern;
  delayedShotChance: number;
  bulletWeights?: { asteroid: number; meteora: number; viper: number };
}

interface EnemyEntry {
  boss: Boss;
  trion: number;
  maxTrion: number;
  behavior: EnemyBehavior;
}

interface EnemyTarget {
  boss: Boss;
  getTrion: () => number;
  setTrion: (value: number) => void;
  maxTrion: number;
}

export class MainScene extends Phaser.Scene {
  private player!: Player;
  private boss!: Boss;
  private extraEnemies: EnemyEntry[] = [];
  private playerBullets: Bullet[] = [];
  private bossBullets: Bullet[] = [];
  private playerShield: Shield | null = null;
  private gameStartTime: number = 0;
  private spawnedShieldedEnemy = false;
  private spawnedRapidEnemy = false;
  private difficulty: Difficulty = 'easy';
  private gameStarted = false;
  private battleStartTime = 0;
  private readonly fireDelayMs = 2000;
  private readonly maxPlayerBullets = 240;
  private readonly maxBossBullets = 300;
  private isMobileMode = false;
  private selectedBulletTypes: BulletType[] = ['asteroid', 'meteora', 'viper'];
  private isTutorialMode = false;
  
  private gameState: GameState = {
    playerTrion: GAME_CONFIG.PLAYER_TRION_MAX,
    bossTrion: GAME_CONFIG.BOSS_TRION_MAX,
    currentBulletType: 'asteroid',
    delayedAsteroidEnabled: false,
    isGameOver: false,
    playerWon: false,
    availableBulletTypes: ['asteroid', 'meteora', 'viper'],
  };
  
  // Input
  private lastFireTime: number = 0;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private qKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  
  // Mobile input state
  private mobileInput = {
    moveX: 0,
    moveY: 0,
    attacking: false,
    aimX: GAME_CONFIG.WIDTH / 2,
    aimY: 0,
  };
  
  // UI Elements
  private playerTrionBar!: Phaser.GameObjects.Graphics;
  private bossTrionBar!: Phaser.GameObjects.Graphics;
  private playerTrionText!: Phaser.GameObjects.Text;
  private bossTrionText!: Phaser.GameObjects.Text;
  private bulletTypeText!: Phaser.GameObjects.Text;
  private delayedAsteroidText!: Phaser.GameObjects.Text;
  private gameOverText!: Phaser.GameObjects.Text;
  private instructionsOverlay!: Phaser.GameObjects.Container;
  private tutorialOverlay?: Phaser.GameObjects.Container;
  private tutorialHelpText?: Phaser.GameObjects.Text;
  private enemyBars: Phaser.GameObjects.Graphics[] = [];
  private enemyTexts: Phaser.GameObjects.Text[] = [];
  private enemyLabels: Phaser.GameObjects.Text[] = [];

  public setMobileMode(mobile: boolean) {
    this.isMobileMode = mobile;
  }

  constructor() {
    super({ key: 'MainScene' });
  }

  create() {
    this.isTutorialMode = false;
    this.tutorialOverlay = undefined;
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
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.input.keyboard?.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.SHIFT]);

    // Mouse input for shooting
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.gameState.isGameOver || !this.gameStarted) return;

      if (pointer.middleButtonDown()) {
        return;
      }
      this.tryFireBullet();
    });
    
    // Create UI
    this.createUI();
    
    // Show instructions briefly
    this.showInstructions();
    
    // Reset game state
    this.resetGameState();
    this.gameStarted = false;
    this.battleStartTime = 0;
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

    const enemyBarWidth = 160;
    const enemyBarHeight = 12;
    const enemyStartY = uiY + 44;
    const enemySpacing = 26;

    for (let i = 0; i < 2; i += 1) {
      const y = enemyStartY + i * enemySpacing;
      const label = this.add.text(
        GAME_CONFIG.WIDTH - 20 - enemyBarWidth,
        y - 10,
        `ENEMY ${i + 1}`,
        {
          fontSize: '12px',
          color: '#ffb347',
          fontFamily: 'monospace',
        }
      );
      const bar = this.add.graphics();
      const text = this.add.text(
        GAME_CONFIG.WIDTH - 20 - enemyBarWidth - 40,
        y + 2,
        '',
        {
          fontSize: '12px',
          color: '#ffffff',
          fontFamily: 'monospace',
        }
      );
      label.setVisible(false);
      bar.setVisible(false);
      text.setVisible(false);
      this.enemyLabels.push(label);
      this.enemyBars.push(bar);
      this.enemyTexts.push(text);
    }
    
    // Bottom UI - Bullet type and Delay status
    const bottomY = GAME_CONFIG.HEIGHT - 40;
    
    // Background panel for bottom UI
    const panel = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      bottomY,
      360,
      50,
      GAME_CONFIG.UI_BG_COLOR,
      0.8
    );
    panel.setStrokeStyle(1, GAME_CONFIG.BULLET_COLOR, 0.5);
    
    this.bulletTypeText = this.add.text(GAME_CONFIG.WIDTH / 2 - 140, bottomY - 10, '', {
      fontSize: '18px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    
    this.delayedAsteroidText = this.add.text(GAME_CONFIG.WIDTH / 2 + 40, bottomY - 10, '', {
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

    this.tutorialHelpText = this.add.text(
      GAME_CONFIG.WIDTH - 20,
      uiY + 70,
      '',
      {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'right',
        lineSpacing: 6,
      }
    );
    this.tutorialHelpText.setOrigin(1, 0);
    this.tutorialHelpText.setVisible(false);
    this.tutorialHelpText.setDepth(90);
  }

  private showInstructions() {
    const bg = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2,
      GAME_CONFIG.WIDTH,
      GAME_CONFIG.HEIGHT,
      0x0a0a12,
      0.95
    );
    bg.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    
    const titleY = GAME_CONFIG.HEIGHT / 2 - 180;
    const tutorialButtonY = GAME_CONFIG.HEIGHT / 2 - (this.isMobileMode ? 120 : 140);
    const instructionTextY = GAME_CONFIG.HEIGHT / 2 - (this.isMobileMode ? 40 : 100);
    const difficultyLabelY = GAME_CONFIG.HEIGHT / 2 + (this.isMobileMode ? 70 : 10);
    const actionButtonWidth = this.isMobileMode ? 320 : 180;
    const actionButtonHeight = this.isMobileMode ? 80 : 50;

    const title = this.add.text(GAME_CONFIG.WIDTH / 2, titleY, '- TRION BATTLE -', {
      fontSize: this.isMobileMode ? '42px' : '28px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    title.setOrigin(0.5);

    const instructionElements: Phaser.GameObjects.GameObject[] = [bg, title];

    const tutorialButton = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      tutorialButtonY,
      actionButtonWidth,
      actionButtonHeight,
      0x1a1a3a,
      0.95
    );
    tutorialButton.setStrokeStyle(3, GAME_CONFIG.BULLET_COLOR, 0.9);
    const tutorialText = this.add.text(GAME_CONFIG.WIDTH / 2, tutorialButtonY, 'チュートリアル', {
      fontSize: this.isMobileMode ? '26px' : '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    tutorialText.setOrigin(0.5);
    const handleTutorial = () => {
      this.startTutorial();
    };
    tutorialButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleTutorial);
    tutorialText.setInteractive({ useHandCursor: true }).on('pointerdown', handleTutorial);
    instructionElements.push(tutorialButton, tutorialText);
    
    // Only show keyboard instructions on desktop
    if (!this.isMobileMode) {
      const leftText = this.add.text(GAME_CONFIG.WIDTH / 2 - 210, instructionTextY, 'MOVE: WASD\nAIM: MOUSE\nHOLD LMB: FIRE\nCLICK LMB: FIRE', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'monospace',
        align: 'left',
        lineSpacing: 6,
      });

      const rightText = this.add.text(
        GAME_CONFIG.WIDTH / 2 + 30,
        instructionTextY,
        'E: CYCLE TRIGGER\nQ: DELAY ASTEROID\nSPACE: SHIELD\nSHIFT + SPACE: WIDE SHIELD',
        {
          fontSize: '16px',
          color: '#ffffff',
          fontFamily: 'monospace',
          align: 'left',
          lineSpacing: 6,
        }
      );
      instructionElements.push(leftText, rightText);
    } else {
      // Mobile instructions: omit key-specific details
      const mobileInstructions = this.add.text(
        GAME_CONFIG.WIDTH / 2,
        instructionTextY,
        'トリオンを使って戦うゲーム。\n「弾を打つ」「シールドを張る」「攻撃を受ける」と\nトリオンが減る。\nトリオンが0になったら死ぬ。',
        {
          fontSize: '26px',
          color: '#ffffff',
          fontFamily: 'monospace',
          align: 'center',
          lineSpacing: 10,
        }
      );
      mobileInstructions.setOrigin(0.5);
      instructionElements.push(mobileInstructions);
    }

    const difficultyLabel = this.add.text(GAME_CONFIG.WIDTH / 2, difficultyLabelY, 'SELECT DIFFICULTY', {
      fontSize: this.isMobileMode ? '30px' : '18px',
      color: '#00ffd5',
      fontFamily: 'monospace',
    });
    difficultyLabel.setOrigin(0.5);

    // Create large touch-friendly buttons for mobile
    const buttonWidth = this.isMobileMode ? 360 : 80;
    const buttonHeight = this.isMobileMode ? 84 : 40;
    const buttonY = difficultyLabelY + (this.isMobileMode ? 100 : 80);
    const buttonSpacing = this.isMobileMode ? 30 : 20;
    const totalButtonWidth = buttonWidth * 3 + buttonSpacing * 2;
    const firstButtonX = GAME_CONFIG.WIDTH / 2 - totalButtonWidth / 2 + buttonWidth / 2;
    const easyButtonX = firstButtonX;
    const middleButtonX = firstButtonX + buttonWidth + buttonSpacing;
    const hardButtonX = middleButtonX + buttonWidth + buttonSpacing;

    // Easy button
    const easyBg = this.add.rectangle(
      easyButtonX,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a3a,
      0.9
    );
    easyBg.setStrokeStyle(3, GAME_CONFIG.BULLET_COLOR, 0.8);
    
    const easyText = this.add.text(
      easyButtonX,
      buttonY,
      'EASY',
      {
        fontSize: this.isMobileMode ? '36px' : '20px',
        color: this.difficulty === 'easy' ? '#00ffd5' : '#aaaaaa',
        fontFamily: 'monospace',
      }
    );
    easyText.setOrigin(0.5);

    // Middle button
    const middleBg = this.add.rectangle(
      middleButtonX,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a3a,
      0.9
    );
    middleBg.setStrokeStyle(3, 0xffd166, 0.8);

    const middleText = this.add.text(
      middleButtonX,
      buttonY,
      'MIDDLE',
      {
        fontSize: this.isMobileMode ? '36px' : '20px',
        color: this.difficulty === 'middle' ? '#ffd166' : '#aaaaaa',
        fontFamily: 'monospace',
      }
    );
    middleText.setOrigin(0.5);

    // Hard button
    const hardBg = this.add.rectangle(
      hardButtonX,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a3a,
      0.9
    );
    hardBg.setStrokeStyle(3, 0xff6b6b, 0.8);
    
    const hardText = this.add.text(
      hardButtonX,
      buttonY,
      'HARD',
      {
        fontSize: this.isMobileMode ? '36px' : '20px',
        color: this.difficulty === 'hard' ? '#ff6b6b' : '#aaaaaa',
        fontFamily: 'monospace',
      }
    );
    hardText.setOrigin(0.5);

    const promptText = !this.isMobileMode
      ? this.add.text(
          GAME_CONFIG.WIDTH / 2,
          GAME_CONFIG.HEIGHT / 2 + 140,
          'SELECT DIFFICULTY AND TRIGGERS, THEN START',
          {
            fontSize: '16px',
            color: '#ffffff',
            fontFamily: 'monospace',
          }
        )
      : null;
    promptText?.setOrigin(0.5);

    const updateDifficultySelection = (difficulty: Difficulty) => {
      this.difficulty = difficulty;
      easyText.setColor(difficulty === 'easy' ? '#00ffd5' : '#aaaaaa');
      middleText.setColor(difficulty === 'middle' ? '#ffd166' : '#aaaaaa');
      hardText.setColor(difficulty === 'hard' ? '#ff6b6b' : '#aaaaaa');
      easyBg.setStrokeStyle(3, difficulty === 'easy' ? GAME_CONFIG.BULLET_COLOR : 0x444444, 0.8);
      middleBg.setStrokeStyle(3, difficulty === 'middle' ? 0xffd166 : 0x444444, 0.8);
      hardBg.setStrokeStyle(3, difficulty === 'hard' ? 0xff6b6b : 0x444444, 0.8);
    };

    // Make both background and text interactive for touch
    easyBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      updateDifficultySelection('easy');
    });
    easyText.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      updateDifficultySelection('easy');
    });

    middleBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      updateDifficultySelection('middle');
    });
    middleText.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      updateDifficultySelection('middle');
    });

    hardBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      updateDifficultySelection('hard');
    });
    hardText.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      updateDifficultySelection('hard');
    });

    instructionElements.push(difficultyLabel, easyBg, easyText, middleBg, middleText, hardBg, hardText);
    if (promptText) {
      instructionElements.push(promptText);
    }

    const weaponLabel = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2 + (this.isMobileMode ? 240 : 165),
      'SELECT 3 TRIGGERS',
      {
        fontSize: this.isMobileMode ? '28px' : '16px',
        color: '#00ffd5',
        fontFamily: 'monospace',
      }
    );
    weaponLabel.setOrigin(0.5);
    instructionElements.push(weaponLabel);

    const weaponStatus = this.add.text(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2 + (this.isMobileMode ? 275 : 190),
      '',
      {
        fontSize: this.isMobileMode ? '22px' : '14px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }
    );
    weaponStatus.setOrigin(0.5);
    instructionElements.push(weaponStatus);

    const weaponButtons: { type: BulletType; bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
    const weaponButtonWidth = this.isMobileMode ? 220 : 120;
    const weaponButtonHeight = this.isMobileMode ? 70 : 40;
    const weaponSpacing = this.isMobileMode ? 20 : 16;
    const weaponStartY = GAME_CONFIG.HEIGHT / 2 + (this.isMobileMode ? 350 : 245);
    const weaponRowSpacing = this.isMobileMode ? 90 : 50;
    const weaponRowCount = this.isMobileMode ? 2 : 1;
    const weaponButtonsPerRow = this.isMobileMode ? 2 : 4;
    const weaponTotalWidth = weaponButtonWidth * weaponButtonsPerRow + weaponSpacing * (weaponButtonsPerRow - 1);
    const weaponStartX = GAME_CONFIG.WIDTH / 2 - weaponTotalWidth / 2 + weaponButtonWidth / 2;

    const weaponNames: Record<BulletType, string> = {
      asteroid: 'ASTEROID',
      meteora: 'METEORA',
      viper: 'VIPER',
      red: 'RED BULLET',
    };

    const startButtonY = GAME_CONFIG.HEIGHT / 2 + (this.isMobileMode ? 470 : 320);
    const startButton = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      startButtonY,
      actionButtonWidth,
      actionButtonHeight,
      0x1a1a3a,
      0.95
    );
    startButton.setStrokeStyle(3, GAME_CONFIG.BULLET_COLOR, 0.9);
    const startText = this.add.text(GAME_CONFIG.WIDTH / 2, startButtonY, 'START', {
      fontSize: this.isMobileMode ? '30px' : '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    startText.setOrigin(0.5);

    const updateWeaponButtons = () => {
      weaponStatus.setText(`SELECTED: ${this.selectedBulletTypes.length}/3`);
      weaponButtons.forEach(({ type, bg, label }) => {
        const selected = this.selectedBulletTypes.includes(type);
        const strokeColor = selected ? GAME_CONFIG.BULLET_COLOR : 0x444444;
        const textColor = selected ? '#00ffd5' : '#aaaaaa';
        bg.setStrokeStyle(3, strokeColor, selected ? 0.9 : 0.5);
        label.setColor(textColor);
      });
      startButton.setAlpha(this.selectedBulletTypes.length === 3 ? 1 : 0.45);
    };

    AVAILABLE_BULLET_TYPES.forEach((type, index) => {
      const row = this.isMobileMode ? Math.floor(index / weaponButtonsPerRow) : 0;
      const col = this.isMobileMode ? index % weaponButtonsPerRow : index;
      if (row >= weaponRowCount) return;
      const x = weaponStartX + col * (weaponButtonWidth + weaponSpacing);
      const y = weaponStartY + row * weaponRowSpacing;
      const bg = this.add.rectangle(x, y, weaponButtonWidth, weaponButtonHeight, 0x1a1a3a, 0.9);
      bg.setStrokeStyle(3, 0x444444, 0.5);
      const label = this.add.text(x, y, weaponNames[type], {
        fontSize: this.isMobileMode ? '22px' : '14px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      });
      label.setOrigin(0.5);
      const toggleSelection = () => {
        if (this.selectedBulletTypes.includes(type)) {
          this.selectedBulletTypes = this.selectedBulletTypes.filter(item => item !== type);
        } else if (this.selectedBulletTypes.length < 3) {
          this.selectedBulletTypes = [...this.selectedBulletTypes, type];
        }
        updateWeaponButtons();
      };
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', toggleSelection);
      label.setInteractive({ useHandCursor: true }).on('pointerdown', toggleSelection);
      weaponButtons.push({ type, bg, label });
      instructionElements.push(bg, label);
    });

    const handleStart = () => {
      if (this.selectedBulletTypes.length !== 3) return;
      this.startBattle();
    };
    startButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleStart);
    startText.setInteractive({ useHandCursor: true }).on('pointerdown', handleStart);
    instructionElements.push(startButton, startText);

    updateWeaponButtons();
    
    this.instructionsOverlay = this.add.container(0, 0, instructionElements);
    this.instructionsOverlay.setDepth(100);
  }

  private startBattle() {
    if (this.gameStarted) return;
    this.gameStarted = true;
    this.gameStartTime = this.time.now;
    this.battleStartTime = this.time.now;
    this.gameState.availableBulletTypes = [...this.selectedBulletTypes];
    this.gameState.currentBulletType = this.gameState.availableBulletTypes[0] ?? 'asteroid';
    this.instructionsOverlay.destroy(true);
  }

  private startTutorial() {
    this.isTutorialMode = true;
    this.difficulty = 'easy';
    this.selectedBulletTypes = [...AVAILABLE_BULLET_TYPES];
    this.resetGameState();
    this.gameState.availableBulletTypes = [...AVAILABLE_BULLET_TYPES];
    this.gameState.currentBulletType = 'asteroid';
    this.gameStarted = true;
    this.gameStartTime = this.time.now;
    this.battleStartTime = this.time.now;
    this.gameOverText.setVisible(false);
    this.instructionsOverlay.destroy(true);
    this.boss.deactivateShield();
    this.showTutorialOverlay();
  }

  private showTutorialOverlay() {
    if (!this.tutorialHelpText) return;
    this.tutorialHelpText.setText(this.getTutorialHelpText());
    this.tutorialHelpText.setVisible(true);

    const buttonX = this.isMobileMode ? 140 : 120;
    const buttonY = this.isMobileMode ? 70 : 60;
    const buttonWidth = this.isMobileMode ? 220 : 180;
    const buttonHeight = this.isMobileMode ? 64 : 48;

    const backButton = this.add.rectangle(
      buttonX,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a3a,
      0.95
    );
    backButton.setStrokeStyle(2, GAME_CONFIG.BULLET_COLOR, 0.8);
    const backText = this.add.text(buttonX, buttonY, 'BACK', {
      fontSize: this.isMobileMode ? '22px' : '16px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    backText.setOrigin(0.5);

    const handleBack = () => {
      this.scene.restart();
    };
    backButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);
    backText.setInteractive({ useHandCursor: true }).on('pointerdown', handleBack);

    this.tutorialOverlay = this.add.container(0, 0, [backButton, backText]);
    this.tutorialOverlay.setDepth(100);
  }

  private getTutorialHelpText() {
    return [
      '操作方法',
      'MOVE: WASD',
      'AIM: MOUSE',
      'LMB/HOLD: FIRE',
      'E: トリガー切替',
      'Q: アステロイド遅延',
      'SPACE: シールド',
      'SHIFT+SPACE: ワイドシールド',
      '',
      '弾の種類 (コスト/ダメージ)',
      `ASTEROID: ${GAME_CONFIG.ASTEROID_COST}/${GAME_CONFIG.ASTEROID_TRION_DAMAGE}`,
      `METEORA: ${GAME_CONFIG.METEORA_COST}/${GAME_CONFIG.METEORA_TRION_DAMAGE}`,
      `VIPER: ${GAME_CONFIG.VIPER_COST}/${GAME_CONFIG.VIPER_TRION_DAMAGE}`,
      `RED: ${GAME_CONFIG.RED_BULLET_COST}/${GAME_CONFIG.RED_BULLET_TRION_DAMAGE}`,
    ].join('\n');
  }

  private canFire(time: number = this.time.now) {
    if (!this.gameStarted) return false;
    return time - this.battleStartTime >= this.fireDelayMs;
  }

  private resetGameState() {
    this.playerBullets.forEach(bullet => bullet.destroy());
    this.bossBullets.forEach(bullet => bullet.destroy());
    this.playerBullets = [];
    this.bossBullets = [];
    this.extraEnemies.forEach(enemy => enemy.boss.destroy());
    this.extraEnemies = [];

    this.gameState = {
      playerTrion: GAME_CONFIG.PLAYER_TRION_MAX,
      bossTrion: GAME_CONFIG.BOSS_TRION_MAX,
      currentBulletType: 'asteroid',
      delayedAsteroidEnabled: false,
      isGameOver: false,
      playerWon: false,
      availableBulletTypes: [...this.selectedBulletTypes],
    };
    this.spawnedShieldedEnemy = false;
    this.spawnedRapidEnemy = false;

    this.gameOverText.setVisible(false);
  }

  update(time: number, delta: number) {
    if (this.gameState.isGameOver) {
      if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
        this.scene.restart();
      }
      return;
    }

    if (!this.gameStarted) {
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

    // Spawn timed enemies
    if (!this.isTutorialMode) {
      this.spawnTimedEnemies(time);
    }
    
    // Update entities
    this.player.update(delta, this.mobileInput);
    if (!this.isTutorialMode && this.gameState.bossTrion > 0) {
      this.boss.update(delta, this.player.x, this.player.y, time);
      // Boss firing
      this.fireEnemy(
        { boss: this.boss, trion: this.gameState.bossTrion, maxTrion: GAME_CONFIG.BOSS_TRION_MAX, behavior: this.getPrimaryBossBehavior() },
        time
      );
    }

    if (!this.isTutorialMode) {
      for (const enemy of this.extraEnemies) {
        if (enemy.trion <= 0) continue;
        enemy.boss.update(delta, this.player.x, this.player.y, time);
        this.fireEnemy(enemy, time);
      }
    }
    
    // Update bullets
    this.updateBullets(delta);
    
    // Update shield
    if (this.playerShield?.active) {
      this.playerShield.update(this.player.x, this.player.y, this.player.angle);
    }
    
    // Check collisions
    this.checkCollisions();

    if (!this.isTutorialMode) {
      this.cleanupDefeatedEnemies();
    }
    
    // Update UI
    this.updateUI();
    
    // Check win/lose conditions
    if (!this.isTutorialMode) {
      this.checkGameOver();
    }
  }

  private handleInput() {
    // Toggle asteroid delay mode
    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
      this.gameState.delayedAsteroidEnabled = !this.gameState.delayedAsteroidEnabled;
    }
    
    // Switch bullet type (cycle through selected types)
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      const types = this.gameState.availableBulletTypes;
      const currentIndex = types.indexOf(this.gameState.currentBulletType);
      if (types.length > 0) {
        this.gameState.currentBulletType = types[(currentIndex + 1) % types.length];
      }
    }
    
    // Deploy shield
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.tryDeployShield();
    }

    // Continuous fire while holding (except for viper which fires on click)
    const isDesktopFiring = this.input.activePointer.isDown && !this.input.activePointer.rightButtonDown();
    const isMobileFiring = this.mobileInput.attacking;
    
    if (isDesktopFiring || isMobileFiring) {
      if (this.gameState.currentBulletType !== 'viper') {
        this.tryFireBullet();
      } else if (isMobileFiring) {
        // Allow viper to fire on mobile hold
        this.tryFireBullet();
      }
    }
  }

  private tryFireBullet() {
    if (!this.canFire()) return;
    const now = this.time.now;
    const fireInterval = 1000 / GAME_CONFIG.FIRE_RATE;
    
    if (now - this.lastFireTime < fireInterval) return;
    
    const bulletType = this.gameState.currentBulletType;
    let cost: number;
    
    if (bulletType === 'asteroid') {
      cost = GAME_CONFIG.ASTEROID_COST;
    } else if (bulletType === 'meteora') {
      cost = GAME_CONFIG.METEORA_COST;
    } else if (bulletType === 'viper') {
      cost = GAME_CONFIG.VIPER_COST;
    } else {
      cost = GAME_CONFIG.RED_BULLET_COST;
    }
    
    // Check if enough Trion
    if (this.gameState.playerTrion < cost) return;
    
    // Consume Trion
    this.gameState.playerTrion -= cost;
    this.lastFireTime = now;
    
    const aim = this.player.getAimDirection();
    const baseAngle = Math.atan2(aim.y, aim.x);
    
    const damageScale = this.getDamageScale();
    let bullet: Bullet;
    if (bulletType === 'asteroid') {
      bullet = new Bullet(
        this,
        this.player.x + aim.x * 20,
        this.player.y + aim.y * 20,
        baseAngle,
        'asteroid',
        true,
        GAME_CONFIG.ASTEROID_TRION_DAMAGE * damageScale,
        GAME_CONFIG.ASTEROID_SHIELD_DAMAGE * damageScale
      );
    } else if (bulletType === 'meteora') {
      bullet = new Bullet(
        this,
        this.player.x + aim.x * 20,
        this.player.y + aim.y * 20,
        baseAngle,
        'meteora',
        true,
        GAME_CONFIG.METEORA_TRION_DAMAGE * damageScale,
        GAME_CONFIG.METEORA_SHIELD_DAMAGE * damageScale
      );
    } else if (bulletType === 'viper') {
      // Viper - guided bullet
      bullet = new Bullet(
        this,
        this.player.x + aim.x * 20,
        this.player.y + aim.y * 20,
        baseAngle,
        'viper',
        true,
        GAME_CONFIG.VIPER_TRION_DAMAGE * damageScale,
        GAME_CONFIG.VIPER_SHIELD_DAMAGE * damageScale
      );
    } else {
      bullet = new Bullet(
        this,
        this.player.x + aim.x * 20,
        this.player.y + aim.y * 20,
        baseAngle,
        'red',
        true,
        GAME_CONFIG.RED_BULLET_TRION_DAMAGE * damageScale,
        GAME_CONFIG.RED_BULLET_SHIELD_DAMAGE * damageScale
      );
    }
    this.playerBullets.push(bullet);
    this.trimBulletPool(this.playerBullets, this.maxPlayerBullets);
    if (bulletType === 'asteroid' && this.gameState.delayedAsteroidEnabled) {
      this.scheduleDelayedRelease(bullet, () => this.getClosestEnemyPosition(), 3000);
    }
  }

  private tryDeployShield() {
    // Check cooldown (only one shield at a time)
    if (this.playerShield && !this.playerShield.active) {
      this.playerShield = null;
    }
    if (this.playerShield?.active) return;
    
    // Check Trion
    if (this.gameState.playerTrion < GAME_CONFIG.SHIELD_COST) return;
    
    // Consume Trion
    this.gameState.playerTrion -= GAME_CONFIG.SHIELD_COST;
    
    const shieldType = this.shiftKey.isDown ? 'wide' : 'narrow';
    this.playerShield = new Shield(this, this.player.x, this.player.y, this.player.angle, shieldType, GAME_CONFIG.PLAYER_RADIUS);
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

  private trimBulletPool(bullets: Bullet[], maxBullets: number) {
    const overflow = bullets.length - maxBullets;
    if (overflow <= 0) return;
    for (let i = 0; i < overflow; i += 1) {
      bullets[i].destroy();
    }
    bullets.splice(0, overflow);
  }


  private spawnTimedEnemies(time: number) {
    if (this.difficulty === 'easy') {
      return;
    }
    const elapsed = time - this.gameStartTime;
    if (!this.spawnedShieldedEnemy && elapsed >= 30000) {
      this.spawnedShieldedEnemy = true;
      this.spawnShieldedEnemy();
    }

    if (!this.spawnedRapidEnemy && elapsed >= 60000) {
      this.spawnedRapidEnemy = true;
      this.spawnRapidEnemy();
    }
  }

  private spawnShieldedEnemy() {
    const config: Partial<BossConfig> = {
      speed: GAME_CONFIG.BOSS_SPEED * 0.95,
      fireRate: GAME_CONFIG.BOSS_FIRE_RATE * 1.25,
      bulletSpeed: GAME_CONFIG.BOSS_BULLET_SPEED * 1.1,
      shieldCooldown: 1400,
      color: 0xffa94d,
    };
    const boss = new Boss(this, GAME_CONFIG.WIDTH * 0.25, 200, config);
    this.extraEnemies.push({
      boss,
      trion: GAME_CONFIG.BOSS_TRION_MAX + 15,
      maxTrion: GAME_CONFIG.BOSS_TRION_MAX + 15,
      behavior: {
        pattern: 'delayedAsteroid',
        delayedShotChance: 0.85,
      },
    });
  }

  private spawnRapidEnemy() {
    const config: Partial<BossConfig> = {
      speed: GAME_CONFIG.BOSS_SPEED * 1.6,
      fireRate: GAME_CONFIG.BOSS_FIRE_RATE * 1.6,
      bulletSpeed: GAME_CONFIG.BOSS_BULLET_SPEED * 1.3,
      shieldCooldown: 2200,
      color: 0xff6bf0,
    };
    const boss = new Boss(this, GAME_CONFIG.WIDTH * 0.75, 220, config);
    this.extraEnemies.push({
      boss,
      trion: GAME_CONFIG.BOSS_TRION_MAX + 30,
      maxTrion: GAME_CONFIG.BOSS_TRION_MAX + 30,
      behavior: {
        pattern: 'meteoraBarrage',
        delayedShotChance: 0.15,
      },
    });
  }

  private getEnemyTargets(): EnemyTarget[] {
    const targets: EnemyTarget[] = [];
    if (this.gameState.bossTrion > 0 || this.isTutorialMode) {
      targets.push({
        boss: this.boss,
        getTrion: () => this.gameState.bossTrion,
        setTrion: (value: number) => {
          this.gameState.bossTrion = Math.max(0, value);
        },
        maxTrion: GAME_CONFIG.BOSS_TRION_MAX,
      });
    }

    for (const enemy of this.extraEnemies) {
      if (enemy.trion <= 0) continue;
      targets.push({
        boss: enemy.boss,
        getTrion: () => enemy.trion,
        setTrion: (value: number) => {
          enemy.trion = Math.max(0, value);
        },
        maxTrion: enemy.maxTrion,
      });
    }

    return targets;
  }

  private getClosestEnemyPosition() {
    const targets = this.getEnemyTargets();
    if (targets.length === 0) {
      return { x: this.player.x, y: this.player.y };
    }
    let closest = targets[0];
    let closestDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, closest.boss.x, closest.boss.y);
    for (const target of targets.slice(1)) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.boss.x, target.boss.y);
      if (dist < closestDist) {
        closest = target;
        closestDist = dist;
      }
    }
    return { x: closest.boss.x, y: closest.boss.y };
  }

  private getPrimaryBossBehavior(): EnemyBehavior {
    return {
      pattern: 'mixed',
      delayedShotChance: 0.3,
      bulletWeights: { asteroid: 0.45, meteora: 0.3, viper: 0.25 },
    };
  }

  private fireEnemy(enemy: EnemyEntry, time: number) {
    if (!this.canFire(time)) return;
    const fireData = enemy.boss.fire(time);
    if (!fireData) return;

    const behavior = enemy.behavior;
    const bulletSpeed = enemy.boss.getBulletSpeed();
    const damageScale = this.getDamageScale();
    let bulletType: BulletType = 'asteroid';
    let useDelayedShot = Phaser.Math.FloatBetween(0, 1) < behavior.delayedShotChance;

    if (behavior.pattern === 'mixed') {
      const weights = behavior.bulletWeights ?? { asteroid: 0.45, meteora: 0.3, viper: 0.25 };
      const roll = Phaser.Math.FloatBetween(0, 1);
      if (roll < weights.asteroid) {
        bulletType = 'asteroid';
      } else if (roll < weights.asteroid + weights.meteora) {
        bulletType = 'meteora';
      } else {
        bulletType = 'viper';
      }
    } else if (behavior.pattern === 'meteoraBarrage') {
      bulletType = 'meteora';
    } else {
      bulletType = 'asteroid';
    }

    if (bulletType === 'asteroid') {
      const bullet = new Bullet(
        this,
        fireData.x,
        fireData.y,
        fireData.angle,
        'asteroid',
        false,
        GAME_CONFIG.ASTEROID_TRION_DAMAGE * damageScale,
        GAME_CONFIG.ASTEROID_SHIELD_DAMAGE * damageScale,
        bulletSpeed
      );
      this.bossBullets.push(bullet);
      this.trimBulletPool(this.bossBullets, this.maxBossBullets);
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
        GAME_CONFIG.METEORA_TRION_DAMAGE * damageScale,
        GAME_CONFIG.METEORA_SHIELD_DAMAGE * damageScale,
        bulletSpeed
      );
      this.bossBullets.push(bullet);
      this.trimBulletPool(this.bossBullets, this.maxBossBullets);
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
      GAME_CONFIG.VIPER_TRION_DAMAGE * damageScale,
      GAME_CONFIG.VIPER_SHIELD_DAMAGE * damageScale
    );
    this.bossBullets.push(bullet);
    this.trimBulletPool(this.bossBullets, this.maxBossBullets);
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

  private cleanupDefeatedEnemies() {
    if (this.gameState.bossTrion <= 0 && this.boss.sprite.active) {
      this.boss.destroy();
    }

    this.extraEnemies = this.extraEnemies.filter(enemy => {
      if (enemy.trion <= 0) {
        enemy.boss.destroy();
        return false;
      }
      return true;
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
            this.triggerMeteoraExplosion(playerBullet);
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
              this.triggerMeteoraExplosion(bullet);
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
    const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager;
    if (!soundManager || !('context' in soundManager)) return;
    const context = soundManager.context;
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

  private circleHitsShield(area: Phaser.Geom.Circle, shield: Shield): boolean {
    const shieldBounds = shield.getBounds();

    if (shieldBounds instanceof Phaser.Geom.Rectangle) {
      return Phaser.Geom.Intersects.CircleToRectangle(area, shieldBounds);
    }

    return Phaser.Geom.Intersects.CircleToCircle(area, shieldBounds);
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

  private applyMeteoraExplosion(initialArea: Phaser.Geom.Circle) {
    const pendingExplosions: Phaser.Geom.Circle[] = [initialArea];
    const damageScale = this.getDamageScale();

    while (pendingExplosions.length > 0) {
      const area = pendingExplosions.shift();
      if (!area) continue;

      const bullets = [...this.playerBullets, ...this.bossBullets];
      for (const bullet of bullets) {
        if (!bullet.active) continue;
        const bulletBounds = bullet.getBounds();
        if (!Phaser.Geom.Intersects.CircleToCircle(area, bulletBounds)) continue;

        if (bullet.type === 'meteora') {
          const chainedArea = bullet.explode();
          if (chainedArea) {
            pendingExplosions.push(chainedArea);
          }
        } else {
          bullet.destroy();
        }
      }

      for (const target of this.getEnemyTargets()) {
        const boss = target.boss;
        if (boss.shieldActive && boss.shield && this.circleHitsShield(area, boss.shield)) {
          boss.applyShieldDamage(GAME_CONFIG.METEORA_SHIELD_DAMAGE * damageScale);
          continue;
        }

        const bossBounds = new Phaser.Geom.Circle(boss.x, boss.y, boss.getRadius());
        if (Phaser.Geom.Intersects.CircleToCircle(area, bossBounds)) {
          target.setTrion(target.getTrion() - GAME_CONFIG.METEORA_TRION_DAMAGE * damageScale);
        }
      }
    }
  }

  private getDamageScale() {
    return DIFFICULTY_DAMAGE_MULTIPLIER[this.difficulty];
  }

  private triggerMeteoraExplosion(bullet: Bullet) {
    const explosionArea = bullet.explode();
    if (explosionArea) {
      this.applyMeteoraExplosion(explosionArea);
    }
  }

  private checkCollisions() {
    const playerRadius = GAME_CONFIG.PLAYER_RADIUS;

    this.resolveBulletInterceptions();
    this.resolveHeldBulletClashes(this.playerBullets);
    this.resolveHeldBulletClashes(this.bossBullets);
    
    // Player bullets vs Boss
    for (const bullet of this.playerBullets) {
      if (!bullet.active) continue;

      for (const target of this.getEnemyTargets()) {
        // Check boss shield first
        if (target.boss.shieldActive && target.boss.shield) {
          if (this.bulletHitsShield(bullet, target.boss.shield)) {
            if (bullet.type === 'meteora') {
              this.triggerMeteoraExplosion(bullet);
            } else {
              bullet.destroy();
              target.boss.applyShieldDamage(bullet.shieldDamage);
            }
            break;
          }
        }

        // Check bullet vs boss
        const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, target.boss.x, target.boss.y);
        const bossRadius = target.boss.getRadius();

        const bulletRadius = bullet.getBounds().radius;
        if (bullet.type === 'meteora') {
          // Meteora explodes on contact
          if (dist < bossRadius + bulletRadius) {
            this.triggerMeteoraExplosion(bullet);
            break;
          }
        } else {
          // Asteroid direct hit
          if (dist < bossRadius + bulletRadius) {
            target.setTrion(target.getTrion() - bullet.trionDamage);
            if (bullet.type === 'red') {
              target.boss.applySlow(
                GAME_CONFIG.RED_BULLET_SLOW_DURATION,
                GAME_CONFIG.RED_BULLET_SLOW_MULTIPLIER
              );
            }
            bullet.destroy();
            break;
          }
        }
      }
    }
    
    // Meteora explosions handled by triggerMeteoraExplosion/applyMeteoraExplosion
    
    // Boss bullets vs Player
    for (const bullet of this.bossBullets) {
      if (!bullet.active) continue;
      
      // Check player shield
      if (this.playerShield?.active && this.playerShield) {
        if (this.bulletHitsShield(bullet, this.playerShield)) {
          if (bullet.type === 'meteora') {
            this.triggerMeteoraExplosion(bullet);
          } else {
            bullet.destroy();
          }
          this.playerShield.applyDamage(bullet.shieldDamage);
          continue;
        }
      }
      
      // Check bullet vs player
      const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, this.player.x, this.player.y);
      const bulletRadius = bullet.getBounds().radius;
      if (dist < playerRadius + bulletRadius) {
        this.gameState.playerTrion -= bullet.trionDamage;
        if (bullet.type === 'red') {
          this.player.applySlow(
            GAME_CONFIG.RED_BULLET_SLOW_DURATION,
            GAME_CONFIG.RED_BULLET_SLOW_MULTIPLIER
          );
        }
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
    
    if (this.gameState.bossTrion > 0 || this.isTutorialMode) {
      this.gameState.bossTrion = Math.min(
        GAME_CONFIG.BOSS_TRION_MAX,
        this.gameState.bossTrion + regenAmount
      );
    }

    for (const enemy of this.extraEnemies) {
      if (enemy.trion <= 0) continue;
      enemy.trion = Math.min(enemy.maxTrion, enemy.trion + regenAmount);
    }
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
    this.bulletTypeText.setText(`TRIGGER: ${bulletName}`);

    const delayStatus = this.gameState.delayedAsteroidEnabled ? 'ON' : 'OFF';
    this.delayedAsteroidText.setText(`DELAY: ${delayStatus}`);
    this.delayedAsteroidText.setColor(this.gameState.delayedAsteroidEnabled ? '#00ffd5' : '#666666');
    
    const enemyBarWidth = 160;
    const enemyBarHeight = 12;
    const enemyStartY = uiY + 44;
    const enemySpacing = 26;

    const activeEnemies = this.extraEnemies.filter(enemy => enemy.trion > 0);
    this.enemyBars.forEach((bar, index) => {
      const enemy = activeEnemies[index];
      const label = this.enemyLabels[index];
      const text = this.enemyTexts[index];
      if (!enemy) {
        bar.clear();
        bar.setVisible(false);
        label.setVisible(false);
        text.setVisible(false);
        return;
      }

      const barX = GAME_CONFIG.WIDTH - 20 - enemyBarWidth;
      const barY = enemyStartY + index * enemySpacing;
      const ratio = Math.max(0, enemy.trion / enemy.maxTrion);
      bar.clear();
      bar.fillStyle(0x1a1a2e, 1);
      bar.fillRect(barX, barY, enemyBarWidth, enemyBarHeight);
      bar.fillStyle(enemy.boss === this.extraEnemies[0]?.boss ? 0xffa94d : 0xff6bf0, 1);
      bar.fillRect(barX, barY, enemyBarWidth * ratio, enemyBarHeight);
      bar.lineStyle(1, 0xffffff, 0.4);
      bar.strokeRect(barX, barY, enemyBarWidth, enemyBarHeight);
      bar.setVisible(true);

      label.setPosition(barX, barY - 10);
      label.setVisible(true);

      text.setText(`${Math.floor(enemy.trion)}`);
      text.setPosition(barX - 40, barY + 2);
      text.setVisible(true);
    });
  }

  private checkGameOver() {
    if (this.gameState.playerTrion <= 0) {
      this.gameState.isGameOver = true;
      this.gameState.playerWon = false;
      this.showGameOver('TRION DEPLETED\n\nYOU LOSE');
    } else if (this.gameState.bossTrion <= 0 && this.extraEnemies.length === 0) {
      this.gameState.isGameOver = true;
      this.gameState.playerWon = true;
      this.showGameOver('BOSS DEFEATED\n\nYOU WIN!');
    }
  }

  private showGameOver(message: string) {
    const restartMessage = this.isMobileMode ? 'TAP RESTART BUTTON' : 'Press R to Restart';
    this.gameOverText.setText(`${message}\n\n${restartMessage}`);
    this.gameOverText.setVisible(true);
    this.gameOverText.setColor(this.gameState.playerWon ? '#00ffd5' : '#ff6b6b');
    
    // Add background
    const backgroundHeight = this.isMobileMode ? 360 : 300;
    const backgroundWidth = this.isMobileMode ? 440 : 400;
    const bg = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2,
      backgroundWidth,
      backgroundHeight,
      0x0a0a12,
      0.9
    );
    bg.setStrokeStyle(2, this.gameState.playerWon ? GAME_CONFIG.BULLET_COLOR : GAME_CONFIG.BOSS_COLOR);
    bg.setDepth(99);
    this.gameOverText.setDepth(100);

    const buttonWidth = this.isMobileMode ? 260 : 200;
    const buttonHeight = this.isMobileMode ? 90 : 55;
    const buttonY = GAME_CONFIG.HEIGHT / 2 + (this.isMobileMode ? 140 : 120);

    const restartButton = this.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a3a,
      0.95
    );
    restartButton.setStrokeStyle(3, this.gameState.playerWon ? GAME_CONFIG.BULLET_COLOR : GAME_CONFIG.BOSS_COLOR, 0.9);
    restartButton.setDepth(101);

    const restartText = this.add.text(GAME_CONFIG.WIDTH / 2, buttonY, 'RESTART', {
      fontSize: this.isMobileMode ? '36px' : '20px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    restartText.setOrigin(0.5);
    restartText.setDepth(102);

    const handleRestart = () => {
      this.scene.restart();
    };

    restartButton.setInteractive({ useHandCursor: true }).on('pointerdown', handleRestart);
    restartText.setInteractive({ useHandCursor: true }).on('pointerdown', handleRestart);
  }

  // Mobile control methods - called from React component
  public setMobileMove(x: number, y: number) {
    this.mobileInput.moveX = x;
    this.mobileInput.moveY = y;
    // Update aim direction based on movement for mobile
    if (x !== 0 || y !== 0) {
      this.mobileInput.aimX = this.player.x + x * 200;
      this.mobileInput.aimY = this.player.y + y * 200;
    }
  }

  public setMobileAttack(attacking: boolean) {
    this.mobileInput.attacking = attacking;
  }

  public triggerCycleBullet() {
    if (this.gameState.isGameOver || !this.gameStarted) return;
    const types = this.gameState.availableBulletTypes;
    const currentIndex = types.indexOf(this.gameState.currentBulletType);
    if (types.length > 0) {
      this.gameState.currentBulletType = types[(currentIndex + 1) % types.length];
    }
  }

  public triggerShield(wide: boolean = false) {
    if (this.gameState.isGameOver || !this.gameStarted) return;
    if (wide) {
      // Temporarily set shift key state for wide shield
      const originalShift = this.shiftKey?.isDown;
      if (this.shiftKey) {
        (this.shiftKey as any).isDown = true;
      }
      this.tryDeployShield();
      if (this.shiftKey) {
        (this.shiftKey as any).isDown = originalShift || false;
      }
    } else {
      this.tryDeployShield();
    }
  }

  public getMobileInput() {
    return this.mobileInput;
  }

  public isMobileAttacking() {
    return this.mobileInput.attacking;
  }

  public startGameWithDifficulty(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.startBattle();
  }
}
