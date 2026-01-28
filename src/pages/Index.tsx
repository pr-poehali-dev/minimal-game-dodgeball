import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';

type Vector2D = { x: number; y: number };

type Player = {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  acceleration: Vector2D;
  targetVelocity: Vector2D;
  radius: number;
  team: 'purple' | 'blue';
  isAlive: boolean;
  isPlayer: boolean;
  hasBall: boolean;
  aiState: 'idle' | 'chase' | 'attack' | 'evade';
  aiTimer: number;
  throwDelay: number;
  respawnTime?: number;
  hitTime?: number;
  deathAnimation?: number;
  throwAnimation?: number;
  scale: number;
  rotation: number;
  kills: number;
  hasAura: boolean;
  auraPhase: number;
  invulnerableUntil?: number;
  nickname: string;
  avatar: string;
  trail: Array<{ x: number; y: number; alpha: number }>;
  movementPhase: number;
  patternOffset: Vector2D;
  lastAimAngle: number;
};

type Ball = {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  radius: number;
  justThrown: boolean;
  thrownBy?: string;
  owner?: string;
  trail: Array<{ x: number; y: number; alpha: number }>;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type GameState = 'menu' | 'playing' | 'results';

const CANVAS_WIDTH = window.innerWidth;
const CANVAS_HEIGHT = window.innerHeight;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 8;
const PLAYER_MAX_SPEED = 6;
const BOT_MAX_SPEED = 6;
const PLAYER_ACCELERATION = 0.35;
const BOT_ACCELERATION = 0.35;
const FRICTION = 0.9;
const MOVEMENT_SMOOTHING = 0.25;
const BALL_FRICTION = 0.985;
const BALL_BOUNCE = 0.7;
const THROW_FORCE = 18;
const AI_REACTION_DELAY = 15;
const AI_REACTION_TIME = 30;
const GRAVITY = 0.5;
const RESPAWN_TIME = 5000;
const BALL_PICKUP_RADIUS = 30;

const BOT_NAMES = [
  'Shadow', 'Blaze', 'Nova', 'Pixel', 'Echo', 'Storm', 'Zen', 'Flash',
  'Nexus', 'Volt', 'Cyber', 'Neon', 'Frost', 'Viper', 'Ghost', 'Sparks'
];

const AVATAR_COLORS = [
  '#5865f2', '#3ba55d', '#ed4245', '#faa61a', '#9b87f5', '#0EA5E9',
  '#f26522', '#7289da', '#43b581', '#f04747', '#faa81a', '#00d9ff'
];

const BOT_AVATARS = [
  'https://i.pravatar.cc/150?img=1',
  'https://i.pravatar.cc/150?img=2',
  'https://i.pravatar.cc/150?img=3',
  'https://i.pravatar.cc/150?img=4',
  'https://i.pravatar.cc/150?img=5',
  'https://i.pravatar.cc/150?img=6',
  'https://i.pravatar.cc/150?img=7',
  'https://i.pravatar.cc/150?img=8',
  'https://i.pravatar.cc/150?img=9',
  'https://i.pravatar.cc/150?img=10',
  'https://i.pravatar.cc/150?img=11',
  'https://i.pravatar.cc/150?img=12',
  'https://i.pravatar.cc/150?img=13',
  'https://i.pravatar.cc/150?img=14',
  'https://i.pravatar.cc/150?img=15',
  'https://i.pravatar.cc/150?img=16'
];

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [teamSize, setTeamSize] = useState(5);
  const [score, setScore] = useState({ purple: 5, blue: 5 });
  const [mousePosition, setMousePosition] = useState<Vector2D>({ x: 0, y: 0 });
  const [playerNickname, setPlayerNickname] = useState('Player');
  const [playerAvatar, setPlayerAvatar] = useState(AVATAR_COLORS[0]);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const playersRef = useRef<Player[]>([]);
  const ballsRef = useRef<Ball[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const gameStartTimeRef = useRef<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const avatarImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const distance = (a: Vector2D, b: Vector2D) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const normalize = (v: Vector2D): Vector2D => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
  };

  const loadAvatarImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (avatarImagesRef.current.has(url)) {
        resolve(avatarImagesRef.current.get(url)!);
        return;
      }
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        avatarImagesRef.current.set(url, img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const createDotPattern = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(88, 101, 242, 0.05)';
      ctx.beginPath();
      ctx.arc(1, 1, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  };

  const initGame = useCallback((infinite: boolean, size: number) => {
    const newPlayers: Player[] = [];
    const newBalls: Ball[] = [];
    const playerTeam = Math.random() > 0.5 ? 'purple' : 'blue';

    for (let team = 0; team < 2; team++) {
      const isLeftTeam = team === 0;
      const teamColor = isLeftTeam ? 'purple' : 'blue';
      const xBase = isLeftTeam ? CANVAS_WIDTH * 0.25 : CANVAS_WIDTH * 0.75;

      for (let i = 0; i < size; i++) {
        const isPlayerControlled = teamColor === playerTeam && i === Math.floor(size / 2);
        const player: Player = {
          id: `${teamColor}-${i}`,
          position: {
            x: xBase + (Math.random() - 0.5) * 80,
            y: CANVAS_HEIGHT * 0.2 + i * (CANVAS_HEIGHT * 0.6) / size,
          },
          velocity: { x: 0, y: 0 },
          acceleration: { x: 0, y: 0 },
          targetVelocity: { x: 0, y: 0 },
          radius: PLAYER_RADIUS,
          team: teamColor,
          isAlive: true,
          isPlayer: isPlayerControlled,
          hasBall: true,
          aiState: 'idle',
          aiTimer: 0,
          throwDelay: Math.random() * 180 + 60,
          scale: 1,
          rotation: 0,
          kills: 0,
          hasAura: false,
          auraPhase: 0,
          invulnerableUntil: undefined,
          nickname: isPlayerControlled ? playerNickname : BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
          avatar: isPlayerControlled ? (customAvatarUrl || playerAvatar) : BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)],
          trail: [],
          movementPhase: 0,
          patternOffset: { x: 0, y: 0 },
          lastAimAngle: 0,
        };
        newPlayers.push(player);
        
        if (player.avatar.startsWith('http') || player.avatar.startsWith('data:')) {
          loadAvatarImage(player.avatar).catch(() => {});
        }

        const ball: Ball = {
          id: `ball-${teamColor}-${i}`,
          position: { ...player.position },
          velocity: { x: 0, y: 0 },
          radius: BALL_RADIUS,
          justThrown: false,
          owner: player.id,
          trail: [],
        };
        newBalls.push(ball);
      }
    }

    playersRef.current = newPlayers;
    ballsRef.current = newBalls;
    particlesRef.current = [];
    gameStartTimeRef.current = Date.now();
    setInfiniteMode(infinite);
    setScore({ purple: size, blue: size });
    setCountdown(null);
    setGameState('playing');
  }, [playerNickname, playerAvatar]);

  const createParticles = (x: number, y: number, color: string, count: number) => {
    const particles = particlesRef.current;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 60,
        maxLife: 60,
        color,
        size: 3 + Math.random() * 3,
      });
    }
  };

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = () => {
      const players = playersRef.current;
      const balls = ballsRef.current;

      const currentTime = Date.now();
      const gameStarted = currentTime - gameStartTimeRef.current;
      
      if (gameStarted < 3000) {
        const player = players.find(p => p.isPlayer);
        if (player && !player.invulnerableUntil) {
          player.invulnerableUntil = gameStartTimeRef.current + 3000;
          console.log('🛡️ Invulnerability activated until:', new Date(player.invulnerableUntil).toISOString());
        }
      }

      const alivePlayers = players.filter(p => p.isAlive);
      const maxKills = Math.max(...alivePlayers.map(p => p.kills), 0);
      
      players.forEach(p => p.hasAura = false);
      
      if (maxKills > 0) {
        const topKillers = alivePlayers.filter(p => p.kills === maxKills);
        
        if (topKillers.length > 0) {
          const currentAuraHolder = players.find(p => p.hasAura);
          
          let auraTarget;
          if (currentAuraHolder && topKillers.includes(currentAuraHolder)) {
            auraTarget = currentAuraHolder;
          } else {
            auraTarget = topKillers[0];
          }
          
          auraTarget.hasAura = true;
          auraTarget.auraPhase += 0.05;
        }
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#2b2d31';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      const dotPattern = ctx.createPattern(createDotPattern(), 'repeat');
      if (dotPattern) {
        ctx.fillStyle = dotPattern;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, 0);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
      ctx.stroke();

      players.forEach((player) => {
        if (!player.isAlive) {
          if (infiniteMode && player.respawnTime && Date.now() > player.respawnTime) {
            player.isAlive = true;
            player.hasBall = false;
            player.respawnTime = undefined;
            player.deathAnimation = undefined;
            player.scale = 0.5;
            player.position = {
              x: player.team === 'purple' ? CANVAS_WIDTH * 0.25 : CANVAS_WIDTH * 0.75,
              y: CANVAS_HEIGHT * 0.5,
            };
            player.velocity = { x: 0, y: 0 };
            createParticles(player.position.x, player.position.y, player.team === 'purple' ? '#9b87f5' : '#0EA5E9', 15);
          }
          return;
        }

        if (player.isPlayer) {
          const dx = mousePosition.x - player.position.x;
          const dy = mousePosition.y - player.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > 5) {
            const dir = { x: dx / dist, y: dy / dist };
            player.targetVelocity.x = dir.x * PLAYER_MAX_SPEED;
            player.targetVelocity.y = dir.y * PLAYER_MAX_SPEED;
          } else {
            player.targetVelocity.x = 0;
            player.targetVelocity.y = 0;
          }
        } else {
          player.aiTimer++;

          if (player.aiTimer > AI_REACTION_DELAY) {
            const enemies = players.filter(p => p.team !== player.team && p.isAlive);
            const incomingBalls = balls.filter(b => 
              b.justThrown && 
              b.thrownBy && 
              players.find(p => p.id === b.thrownBy)?.team !== player.team
            );

            const nearestThreat = incomingBalls
              .map(b => ({ ball: b, dist: distance(b.position, player.position) }))
              .filter(({ dist }) => dist < 300)
              .sort((a, b) => a.dist - b.dist)[0];

            if (nearestThreat) {
              player.aiState = 'evade';
              const ball = nearestThreat.ball;
              const awayDir = normalize({
                x: player.position.x - ball.position.x,
                y: player.position.y - ball.position.y,
              });
              const perpDir = { x: -awayDir.y, y: awayDir.x };
              const dodgeChoice = Math.random() > 0.5 ? 1 : -1;
              
              player.velocity.x += (awayDir.x * 0.7 + perpDir.x * dodgeChoice * 0.3) * BOT_ACCELERATION * 2.2;
              player.velocity.y += (awayDir.y * 0.7 + perpDir.y * dodgeChoice * 0.3) * BOT_ACCELERATION * 2.2;
              player.aiTimer = 0;
            } else if (!player.hasBall) {
              const freeBalls = balls.filter(b => !b.owner && !b.justThrown);
              if (freeBalls.length > 0) {
                player.aiState = 'chase';
                const nearest = freeBalls.reduce((prev, curr) => 
                  distance(curr.position, player.position) < distance(prev.position, player.position) ? curr : prev
                );
                const dir = normalize({
                  x: nearest.position.x - player.position.x,
                  y: nearest.position.y - player.position.y,
                });
                player.velocity.x += dir.x * BOT_ACCELERATION * 1.2;
                player.velocity.y += dir.y * BOT_ACCELERATION * 1.2;
              } else {
                player.aiState = 'idle';
                if (Math.random() < 0.015) {
                  const randomDir = {
                    x: (Math.random() - 0.5) * 2,
                    y: (Math.random() - 0.5) * 2,
                  };
                  player.velocity.x += randomDir.x * BOT_ACCELERATION * 0.4;
                  player.velocity.y += randomDir.y * BOT_ACCELERATION * 0.4;
                }
              }
            } else if (player.hasBall && enemies.length > 0) {
              player.throwDelay--;
              
              if (player.throwDelay <= 0) {
                player.aiState = 'attack';
                const target = enemies[Math.floor(Math.random() * enemies.length)];
                const leadTime = distance(player.position, target.position) / THROW_FORCE;
                const predictedPos = {
                  x: target.position.x + target.velocity.x * leadTime * 0.5,
                  y: target.position.y + target.velocity.y * leadTime * 0.5,
                };
                throwBall(player, predictedPos);
                player.throwDelay = Math.random() * 240 + 90;
                player.aiTimer = 0;
                player.scale = 1.3;
              } else {
                player.aiState = 'idle';
                if (Math.random() < 0.02) {
                  const moveChoice = Math.random();
                  if (moveChoice < 0.3) {
                    const closestEnemy = enemies.reduce((prev, curr) => 
                      distance(curr.position, player.position) < distance(prev.position, player.position) ? curr : prev
                    );
                    const dir = normalize({
                      x: closestEnemy.position.x - player.position.x,
                      y: closestEnemy.position.y - player.position.y,
                    });
                    player.velocity.x += dir.x * BOT_ACCELERATION * 0.5;
                    player.velocity.y += dir.y * BOT_ACCELERATION * 0.5;
                  } else if (moveChoice < 0.6) {
                    const awayDir = {
                      x: player.team === 'purple' ? -1 : 1,
                      y: (Math.random() - 0.5) * 2,
                    };
                    player.velocity.x += awayDir.x * BOT_ACCELERATION * 0.3;
                    player.velocity.y += awayDir.y * BOT_ACCELERATION * 0.3;
                  } else {
                    const randomDir = {
                      x: (Math.random() - 0.5) * 2,
                      y: (Math.random() - 0.5) * 2,
                    };
                    player.velocity.x += randomDir.x * BOT_ACCELERATION * 0.3;
                    player.velocity.y += randomDir.y * BOT_ACCELERATION * 0.3;
                  }
                }
              }
            } else {
              player.aiState = 'idle';
            }
          }
        }

        const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);
        
        const velocityDiff = {
          x: player.targetVelocity.x - player.velocity.x,
          y: player.targetVelocity.y - player.velocity.y
        };
        
        player.velocity.x += velocityDiff.x * easeOut(MOVEMENT_SMOOTHING);
        player.velocity.y += velocityDiff.y * easeOut(MOVEMENT_SMOOTHING);

        const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
        const baseMaxSpeed = player.isPlayer ? PLAYER_MAX_SPEED : BOT_MAX_SPEED;
        const maxSpeed = player.hasAura ? baseMaxSpeed * 1.2 : baseMaxSpeed;
        if (speed > maxSpeed) {
          player.velocity.x = (player.velocity.x / speed) * maxSpeed;
          player.velocity.y = (player.velocity.y / speed) * maxSpeed;
        }

        player.velocity.x *= FRICTION;
        player.velocity.y *= FRICTION;

        player.position.x += player.velocity.x;
        player.position.y += player.velocity.y;
        
        player.patternOffset.x += player.velocity.x * 0.8;
        player.patternOffset.y += player.velocity.y * 0.8;

        if (speed > 1) {
          player.trail.push({ x: player.position.x, y: player.position.y, alpha: 1 });
          if (player.trail.length > 6) {
            player.trail.shift();
          }
        } else {
          player.trail = player.trail.filter((_, i) => i > 0);
        }

        player.trail.forEach((t) => {
          t.alpha -= 0.12;
        });

        if (speed > 0.5) {
          player.rotation += speed * 0.05;
        }
        
        if (speed > 0.5) {
          player.movementPhase += speed * 0.15;
          const bounce = Math.sin(player.movementPhase) * 0.02;
          player.scale = 1 + bounce;
        } else {
          if (player.scale > 1) {
            player.scale -= 0.03;
            if (player.scale < 1) player.scale = 1;
          }
        }

        if (player.throwAnimation !== undefined) {
          player.throwAnimation--;
          if (player.throwAnimation <= 0) {
            player.throwAnimation = undefined;
          }
          const throwBounce = 1.3 - (player.throwAnimation / 20) * 0.3;
          player.scale = throwBounce;
        }

        const halfWidth = CANVAS_WIDTH / 2;
        const minX = player.team === 'purple' ? player.radius : halfWidth + player.radius;
        const maxX = player.team === 'purple' ? halfWidth - player.radius : CANVAS_WIDTH - player.radius;

        if (player.position.x < minX) {
          player.position.x = minX;
          player.velocity.x *= -0.5;
        }
        if (player.position.x > maxX) {
          player.position.x = maxX;
          player.velocity.x *= -0.5;
        }
        if (player.position.y < player.radius) {
          player.position.y = player.radius;
          player.velocity.y *= -0.5;
        }
        if (player.position.y > CANVAS_HEIGHT - player.radius) {
          player.position.y = CANVAS_HEIGHT - player.radius;
          player.velocity.y *= -0.5;
        }
      });

      balls.forEach((ball) => {
        if (ball.owner) {
          const owner = players.find(p => p.id === ball.owner);
          if (owner && owner.isAlive) {
            ball.position.x = owner.position.x;
            ball.position.y = owner.position.y;
            ball.velocity = { x: 0, y: 0 };
          } else {
            ball.owner = undefined;
          }
        } else {
          if (ball.justThrown) {
            ball.trail.push({ x: ball.position.x, y: ball.position.y, alpha: 1 });
            if (ball.trail.length > 15) {
              ball.trail.shift();
            }
          } else {
            ball.trail = ball.trail.filter((_, i) => i > 0);
          }

          ball.trail.forEach((t, i) => {
            t.alpha -= 0.05;
          });

          ball.velocity.x *= BALL_FRICTION;
          ball.velocity.y *= BALL_FRICTION;

          ball.position.x += ball.velocity.x;
          ball.position.y += ball.velocity.y;

          if (ball.position.x - ball.radius < 0) {
            ball.position.x = ball.radius;
            ball.velocity.x *= -BALL_BOUNCE;
            ball.justThrown = false;
            createParticles(ball.position.x, ball.position.y, '#FFFFFF', 8);
          }
          if (ball.position.x + ball.radius > CANVAS_WIDTH) {
            ball.position.x = CANVAS_WIDTH - ball.radius;
            ball.velocity.x *= -BALL_BOUNCE;
            ball.justThrown = false;
            createParticles(ball.position.x, ball.position.y, '#FFFFFF', 8);
          }
          if (ball.position.y - ball.radius < 0) {
            ball.position.y = ball.radius;
            ball.velocity.y *= -BALL_BOUNCE;
            ball.justThrown = false;
            createParticles(ball.position.x, ball.position.y, '#FFFFFF', 8);
          }
          if (ball.position.y + ball.radius > CANVAS_HEIGHT) {
            ball.position.y = CANVAS_HEIGHT - ball.radius;
            ball.velocity.y *= -BALL_BOUNCE;
            ball.justThrown = false;
            createParticles(ball.position.x, ball.position.y, '#FFFFFF', 8);
          }

          const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
          if (speed < 0.5) {
            ball.velocity = { x: 0, y: 0 };
            ball.justThrown = false;
          }

          players.forEach((player) => {
            if (!player.isAlive) return;

            const dist = distance(ball.position, player.position);
            
            if (ball.justThrown && ball.thrownBy !== player.id) {
              const thrower = players.find(p => p.id === ball.thrownBy);
              const isInvulnerable = player.invulnerableUntil && Date.now() < player.invulnerableUntil;
              if (player.isPlayer && isInvulnerable) {
                console.log('🛡️ Player protected by invulnerability');
              }
              if (thrower && thrower.team !== player.team && dist < ball.radius + player.radius && !isInvulnerable) {
                if (player.isPlayer) {
                  console.log('💀 Player hit! invulnerableUntil:', player.invulnerableUntil, 'currentTime:', Date.now());
                }
                player.isAlive = false;
                player.hitTime = Date.now();
                player.deathAnimation = 0;
                player.respawnTime = infiniteMode ? Date.now() + RESPAWN_TIME : undefined;
                player.kills = 0;
                
                thrower.kills++;
                
                const hitColor = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
                createParticles(player.position.x, player.position.y, hitColor, 20);
                createParticles(ball.position.x, ball.position.y, '#FF6B6B', 10);
                
                const dx = ball.position.x - player.position.x;
                const dy = ball.position.y - player.position.y;
                const collisionDist = Math.sqrt(dx * dx + dy * dy);
                const nx = dx / collisionDist;
                const ny = dy / collisionDist;
                
                const relativeVelocity = {
                  x: ball.velocity.x - player.velocity.x,
                  y: ball.velocity.y - player.velocity.y,
                };
                
                const velocityAlongNormal = relativeVelocity.x * nx + relativeVelocity.y * ny;
                
                ball.velocity.x = ball.velocity.x - 2 * velocityAlongNormal * nx;
                ball.velocity.y = ball.velocity.y - 2 * velocityAlongNormal * ny;
                ball.velocity.x *= BALL_BOUNCE;
                ball.velocity.y *= BALL_BOUNCE;
                
                ball.justThrown = false;
                ball.thrownBy = undefined;
              }
            } else if (!ball.justThrown && !ball.owner && !player.hasBall && dist < BALL_PICKUP_RADIUS) {
              ball.owner = player.id;
              player.hasBall = true;
              player.scale = 1.2;
              createParticles(ball.position.x, ball.position.y, player.team === 'purple' ? '#9b87f5' : '#0EA5E9', 8);
            }
          });
        }
      });

      balls.forEach((ball1, i) => {
        if (ball1.owner) return;
        
        for (let j = i + 1; j < balls.length; j++) {
          const ball2 = balls[j];
          if (ball2.owner) continue;
          
          const dx = ball2.position.x - ball1.position.x;
          const dy = ball2.position.y - ball1.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = ball1.radius + ball2.radius;
          
          if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            
            const overlap = minDist - dist;
            ball1.position.x -= nx * overlap * 0.5;
            ball1.position.y -= ny * overlap * 0.5;
            ball2.position.x += nx * overlap * 0.5;
            ball2.position.y += ny * overlap * 0.5;
            
            const relativeVelocity = {
              x: ball1.velocity.x - ball2.velocity.x,
              y: ball1.velocity.y - ball2.velocity.y,
            };
            
            const velocityAlongNormal = relativeVelocity.x * nx + relativeVelocity.y * ny;
            
            if (velocityAlongNormal > 0) {
              const restitution = 0.8;
              const impulse = (1 + restitution) * velocityAlongNormal / 2;
              
              ball1.velocity.x -= impulse * nx;
              ball1.velocity.y -= impulse * ny;
              ball2.velocity.x += impulse * nx;
              ball2.velocity.y += impulse * ny;
              
              const impactSpeed = Math.abs(velocityAlongNormal);
              if (impactSpeed > 3) {
                createParticles(
                  (ball1.position.x + ball2.position.x) / 2,
                  (ball1.position.y + ball2.position.y) / 2,
                  '#FFFFFF',
                  Math.floor(impactSpeed / 2)
                );
              }
            }
          }
        }
      });

      const purpleAlive = players.filter(p => p.team === 'purple' && p.isAlive).length;
      const blueAlive = players.filter(p => p.team === 'blue' && p.isAlive).length;
      setScore({ purple: purpleAlive, blue: blueAlive });

      if (!infiniteMode) {
        const playerAlive = players.find(p => p.isPlayer)?.isAlive ?? false;
        if (purpleAlive === 0 || blueAlive === 0 || !playerAlive) {
          setGameState('results');
          return;
        }
      } else {
        const playerAlive = players.find(p => p.isPlayer)?.isAlive ?? false;
        if (!playerAlive) {
          setGameState('results');
          return;
        }
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life--;

        if (p.life <= 0) {
          particles.splice(i, 1);
        } else {
          const alpha = p.life / p.maxLife;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      players.forEach((player) => {
        if (!player.isAlive) {
          if (player.deathAnimation !== undefined && player.deathAnimation < 30) {
            player.deathAnimation++;
            const progress = player.deathAnimation / 30;
            const scale = 1 - progress;
            const alpha = 1 - progress;
            
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 20 * (1 - progress);
            ctx.shadowColor = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
            ctx.fillStyle = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
            ctx.beginPath();
            ctx.arc(player.position.x, player.position.y, player.radius * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
          }
          return;
        }

        if (player.hitTime && Date.now() - player.hitTime < 200) {
          const flashProgress = (Date.now() - player.hitTime) / 200;
          ctx.globalAlpha = 1 - flashProgress * 0.5;
        }

        player.trail.forEach((t, i) => {
          const alpha = t.alpha * (i / player.trail.length);
          if (alpha > 0) {
            ctx.globalAlpha = alpha * 0.4;
            ctx.fillStyle = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
            ctx.beginPath();
            ctx.arc(t.x, t.y, player.radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.globalAlpha = 1;

        const isInvulnerable = player.invulnerableUntil && Date.now() < player.invulnerableUntil;
        
        if (isInvulnerable) {
          const pulsePhase = (Date.now() % 500) / 500;
          const auraSize = player.radius + 20 + Math.sin(pulsePhase * Math.PI * 2) * 8;
          
          ctx.save();
          ctx.translate(player.position.x, player.position.y);
          
          const gradient = ctx.createRadialGradient(0, 0, player.radius, 0, 0, auraSize);
          gradient.addColorStop(0, 'rgba(255, 215, 0, 0)');
          gradient.addColorStop(0.6, 'rgba(255, 215, 0, 0.5)');
          gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, auraSize, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
        } else if (player.hasAura) {
          const auraSize1 = player.radius + 15 + Math.sin(player.auraPhase) * 5;
          const auraSize2 = player.radius + 25 + Math.sin(player.auraPhase + Math.PI) * 5;
          
          ctx.save();
          ctx.translate(player.position.x, player.position.y);
          
          const gradient1 = ctx.createRadialGradient(0, 0, player.radius, 0, 0, auraSize1);
          gradient1.addColorStop(0, 'rgba(139, 0, 0, 0)');
          gradient1.addColorStop(0.7, 'rgba(139, 0, 0, 0.4)');
          gradient1.addColorStop(1, 'rgba(139, 0, 0, 0)');
          
          ctx.fillStyle = gradient1;
          ctx.beginPath();
          ctx.arc(0, 0, auraSize1, 0, Math.PI * 2);
          ctx.fill();
          
          const gradient2 = ctx.createRadialGradient(0, 0, player.radius, 0, 0, auraSize2);
          gradient2.addColorStop(0, 'rgba(255, 0, 0, 0)');
          gradient2.addColorStop(0.6, 'rgba(255, 0, 0, 0.3)');
          gradient2.addColorStop(1, 'rgba(255, 0, 0, 0)');
          
          ctx.fillStyle = gradient2;
          ctx.beginPath();
          ctx.arc(0, 0, auraSize2, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
        }

        ctx.save();
        ctx.translate(player.position.x, player.position.y);
        ctx.scale(player.scale, player.scale);
        ctx.rotate(player.rotation);

        const baseColor = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
        const darkColor = player.team === 'purple' ? '#7c3aed' : '#0369a1';
        
        const lightSources = [
          { x: CANVAS_WIDTH * 0.3, y: CANVAS_HEIGHT * 0.3 },
          { x: CANVAS_WIDTH * 0.7, y: CANVAS_HEIGHT * 0.7 },
        ];
        
        let totalLightX = 0;
        let totalLightY = 0;
        let totalLightIntensity = 0;
        
        for (const light of lightSources) {
          const dx = light.x - player.position.x;
          const dy = light.y - player.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const intensity = 1 / (1 + dist / 500);
          
          totalLightX += (dx / dist) * intensity;
          totalLightY += (dy / dist) * intensity;
          totalLightIntensity += intensity;
        }
        
        totalLightX /= totalLightIntensity;
        totalLightY /= totalLightIntensity;
        
        const shadowOffsetX = -totalLightX * 8;
        const shadowOffsetY = -totalLightY * 8;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(
          shadowOffsetX * 1.5,
          shadowOffsetY * 1.5 + player.radius * 0.3,
          player.radius * 0.9,
          player.radius * 0.3,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        ctx.shadowBlur = player.hasAura ? 25 : 0;
        ctx.shadowColor = player.hasAura ? '#8B0000' : baseColor;
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.clip();
        
        const lightAngle = Math.atan2(totalLightY, totalLightX);
        const lightHighlightX = Math.cos(lightAngle) * player.radius * 0.4;
        const lightHighlightY = Math.sin(lightAngle) * player.radius * 0.4;
        
        const sphereGradient = ctx.createRadialGradient(
          lightHighlightX,
          lightHighlightY,
          0,
          0,
          0,
          player.radius * 1.6
        );
        sphereGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        sphereGradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.1)');
        sphereGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
        sphereGradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
        ctx.fillStyle = sphereGradient;
        ctx.fillRect(-player.radius, -player.radius, player.radius * 2, player.radius * 2);
        
        const patternSize = 50;
        const offsetX = player.patternOffset.x % patternSize;
        const offsetY = player.patternOffset.y % patternSize;
        
        ctx.fillStyle = darkColor;
        for (let i = -2; i < 3; i++) {
          for (let j = -2; j < 3; j++) {
            const baseX = i * patternSize + offsetX;
            const baseY = j * patternSize + offsetY;
            
            const seed = i * 7 + j * 13;
            const size = 6 + (Math.sin(seed * 1.3) + 1) * 4;
            const offsetAngle = seed * 2.1;
            const offsetDist = (Math.sin(seed * 0.7) + 1) * 8;
            
            const px = baseX + Math.cos(offsetAngle) * offsetDist;
            const py = baseY + Math.sin(offsetAngle) * offsetDist;
            
            const distFromCenter = Math.sqrt(px * px + py * py);
            const edgeFade = Math.max(0, 1 - (distFromCenter / player.radius) * 1.2);
            
            if (edgeFade > 0) {
              ctx.globalAlpha = edgeFade * 0.8;
              ctx.beginPath();
              ctx.arc(px, py, size, 0, Math.PI * 2);
              ctx.fill();
              
              if (Math.sin(seed * 3.2) > 0.5) {
                const smallSize = size * 0.4;
                const smallX = px + Math.cos(seed) * 10;
                const smallY = py + Math.sin(seed) * 10;
                const smallDist = Math.sqrt(smallX * smallX + smallY * smallY);
                const smallFade = Math.max(0, 1 - (smallDist / player.radius) * 1.2);
                
                if (smallFade > 0) {
                  ctx.globalAlpha = smallFade * 0.6;
                  ctx.beginPath();
                  ctx.arc(smallX, smallY, smallSize, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
            }
          }
        }
        ctx.globalAlpha = 1;
        
        ctx.restore();
        ctx.globalAlpha = 1;

        if (player.isPlayer) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, player.radius + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        ctx.restore();
        
        if (player.isPlayer) {
          const dx = mousePosition.x - player.position.x;
          const dy = mousePosition.y - player.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > 5) {
            const targetAngle = Math.atan2(dy, dx);
            let angleDiff = targetAngle - player.lastAimAngle;
            
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            player.lastAimAngle += angleDiff * 0.2;
          }
          
          ctx.save();
          ctx.translate(player.position.x, player.position.y);
          ctx.rotate(player.lastAimAngle);
          
          const arcRadius = player.radius + 12;
          const arcLength = Math.PI * 0.25;
          
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, arcRadius, -arcLength / 2, arcLength / 2);
          ctx.stroke();
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(arcRadius, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
        }
        
        ctx.save();
        ctx.translate(player.position.x, player.position.y);
        ctx.scale(player.scale, player.scale);
        ctx.rotate(player.rotation);

        if (player.hasBall) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.beginPath();
          ctx.arc(0, 0, player.radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        ctx.save();
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const nameY = player.position.y - player.radius - 18;
        const avatarSize = 18;
        const padding = 4;
        
        const textMetrics = ctx.measureText(player.nickname);
        const bgWidth = textMetrics.width + avatarSize + padding * 3;
        const bgHeight = avatarSize + padding * 2;
        const bgX = player.position.x - bgWidth / 2;
        const bgY = nameY - bgHeight / 2;
        
        ctx.fillStyle = 'rgba(30, 31, 34, 0.85)';
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 9);
        ctx.fill();
        
        const avatarX = bgX + padding;
        const avatarY = bgY + padding;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        
        if (player.avatar.startsWith('http') || player.avatar.startsWith('data:')) {
          const img = avatarImagesRef.current.get(player.avatar);
          if (img && img.complete) {
            ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
          } else {
            ctx.fillStyle = AVATAR_COLORS[0];
            ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
          }
        } else {
          ctx.fillStyle = player.avatar;
          ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
        }
        
        ctx.restore();
        
        ctx.fillStyle = '#dbdee1';
        ctx.fillText(player.nickname, bgX + avatarSize + padding * 2 + textMetrics.width / 2, nameY);
        
        ctx.restore();
      });

      balls.forEach((ball) => {
        if (ball.owner) return;

        ball.trail.forEach((t, i) => {
          const alpha = t.alpha * (i / ball.trail.length);
          if (alpha > 0) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FF6B6B';
            ctx.beginPath();
            ctx.arc(t.x, t.y, ball.radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.globalAlpha = 1;

        ctx.shadowBlur = ball.justThrown ? 15 : 10;
        ctx.shadowColor = ball.justThrown ? '#FF6B6B' : '#FFFFFF';
        ctx.fillStyle = ball.justThrown ? '#FF6B6B' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });



      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, infiniteMode, mousePosition]);

  const throwBall = (player: Player, target: Vector2D) => {
    const balls = ballsRef.current;
    balls.forEach((ball) => {
      if (ball.owner === player.id) {
        const dir = normalize({
          x: target.x - player.position.x,
          y: target.y - player.position.y,
        });
        ball.owner = undefined;
        ball.velocity = { x: dir.x * THROW_FORCE, y: dir.y * THROW_FORCE };
        ball.justThrown = true;
        ball.thrownBy = player.id;
        ball.trail = [];
        player.hasBall = false;
        player.throwAnimation = 10;
        player.scale = 0.8;
        
        createParticles(player.position.x + dir.x * 20, player.position.y + dir.y * 20, '#FFFFFF', 6);
      }
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const players = playersRef.current;
    const player = players.find(p => p.isPlayer && p.isAlive);
    if (!player || !player.hasBall) return;

    const clickedPlayer = players.find(
      p => p.team !== player.team && p.isAlive && distance(p.position, clickPos) < p.radius + 20
    );

    if (clickedPlayer) {
      throwBall(player, clickedPlayer.position);
    } else {
      throwBall(player, clickPos);
    }
  };

  if (gameState === 'menu') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#2b2d31] relative" style={{
        backgroundImage: 'radial-gradient(circle, rgba(88, 101, 242, 0.05) 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}>
        <div className="absolute top-6 right-6">
          {isEditingProfile ? (
            <div className="bg-[#1e1f22] rounded-lg p-4 shadow-xl w-64">
              <div className="mb-3">
                <label className="text-xs font-semibold text-[#b5bac1] uppercase tracking-wide mb-2 block">Nickname</label>
                <input
                  type="text"
                  value={playerNickname}
                  onChange={(e) => setPlayerNickname(e.target.value.slice(0, 12))}
                  className="w-full bg-[#2b2d31] text-white px-3 py-2 rounded-md text-sm border border-[#40444b] focus:border-[#5865f2] outline-none"
                  maxLength={12}
                />
              </div>
              <div className="mb-4">
                <label className="text-xs font-semibold text-[#b5bac1] uppercase tracking-wide mb-2 block">Avatar Color</label>
                <div className="grid grid-cols-6 gap-2">
                  {AVATAR_COLORS.slice(0, 11).map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        setPlayerAvatar(color);
                        setCustomAvatarUrl(null);
                      }}
                      className={`w-8 h-8 rounded-full transition-all ${
                        playerAvatar === color && !customAvatarUrl ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1e1f22]' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-8 h-8 rounded-full transition-all flex items-center justify-center ${
                      customAvatarUrl ? 'ring-2 ring-white ring-offset-2 ring-offset-[#1e1f22]' : 'border-2 border-dashed border-[#5865f2] hover:bg-[#5865f2]/10'
                    }`}
                    style={customAvatarUrl ? {
                      backgroundImage: `url(${customAvatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    } : {}}
                  >
                    {!customAvatarUrl && <Icon name="Upload" size={14} className="text-[#5865f2]" />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const url = event.target?.result as string;
                          setCustomAvatarUrl(url);
                          setPlayerAvatar(url);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-semibold h-9 rounded-md"
                onClick={() => setIsEditingProfile(false)}
              >
                Done
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingProfile(true)}
              className="flex items-center gap-3 bg-[#1e1f22] hover:bg-[#2b2d31] rounded-lg p-3 transition-colors"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm overflow-hidden"
                style={customAvatarUrl ? {
                  backgroundImage: `url(${customAvatarUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                } : { backgroundColor: playerAvatar }}
              >
                {!customAvatarUrl && playerNickname.charAt(0).toUpperCase()}
              </div>
              <span className="text-white font-semibold text-sm">{playerNickname}</span>
              <Icon name="ChevronDown" size={16} className="text-[#b5bac1]" />
            </button>
          )}
        </div>
        <div className="text-center max-w-md mx-auto px-6 py-8 animate-fade-in">
          <div className="mb-8">
            <h1 className="text-5xl font-extrabold text-white mb-3 tracking-tight">DODGEBALL</h1>
            <p className="text-sm text-[#b5bac1]">Classic ball-throwing action</p>
          </div>
          
          <div className="bg-[#1e1f22] rounded-lg p-6 mb-4">
            <p className="text-xs font-semibold text-[#b5bac1] uppercase tracking-wide mb-3">Team Size</p>
            <div className="flex gap-2 justify-center mb-6">
              {[1, 2, 3, 4, 5].map(size => (
                <button
                  key={size}
                  onClick={() => setTeamSize(size)}
                  className={`w-12 h-12 rounded-md font-bold text-sm transition-all ${
                    teamSize === size
                      ? 'bg-[#5865f2] text-white shadow-lg scale-105'
                      : 'bg-[#2b2d31] text-[#b5bac1] hover:bg-[#35373c]'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            
            <div className="flex flex-col gap-2">
              <Button
                size="lg"
                className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-semibold h-11 rounded-md"
                onClick={() => initGame(false, teamSize)}
              >
                Start Game
              </Button>
              <Button
                size="lg"
                className="w-full bg-[#2b2d31] hover:bg-[#35373c] text-white font-semibold h-11 rounded-md"
                onClick={() => initGame(true, teamSize)}
              >
                Infinite Mode
              </Button>
            </div>
          </div>
          
          <div className="text-xs text-[#80848e] space-y-1">
            <p>• Move your mouse to control</p>
            <p>• Click to throw the ball</p>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'results') {
    const players = playersRef.current;
    const player = players.find(p => p.isPlayer);
    const playerWon = player?.isAlive && score[player.team] > 0;

    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#2b2d31]" style={{
        backgroundImage: 'radial-gradient(circle, rgba(88, 101, 242, 0.05) 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}>
        <div className="text-center max-w-md mx-auto px-6 animate-fade-in">
          <div className="mb-8">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
              playerWon ? 'bg-[#3ba55d]/20' : 'bg-[#ed4245]/20'
            }`}>
              <Icon 
                name={playerWon ? 'Trophy' : 'X'} 
                size={40} 
                className={playerWon ? 'text-[#3ba55d]' : 'text-[#ed4245]'}
              />
            </div>
            <h1 className="text-4xl font-extrabold text-white mb-2">
              {playerWon ? 'VICTORY!' : 'DEFEAT'}
            </h1>
            <div className="flex items-center justify-center gap-4 text-xl font-bold text-[#b5bac1]">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#9b87f5]"></div>
                <span>{score.purple}</span>
              </div>
              <span className="text-[#4e5058]">—</span>
              <div className="flex items-center gap-2">
                <span>{score.blue}</span>
                <div className="w-4 h-4 rounded-full bg-[#0EA5E9]"></div>
              </div>
            </div>
          </div>
          
          <div className="bg-[#1e1f22] rounded-lg p-6 space-y-2">
            <Button
              size="lg"
              className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-semibold h-11 rounded-md"
              onClick={() => initGame(infiniteMode, teamSize)}
            >
              Play Again
            </Button>
            <Button
              size="lg"
              className="w-full bg-[#2b2d31] hover:bg-[#35373c] text-[#b5bac1] font-semibold h-11 rounded-md"
              onClick={() => setGameState('menu')}
            >
              Main Menu
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{
      backgroundImage: 'radial-gradient(circle, rgba(88, 101, 242, 0.05) 1px, transparent 1px)',
      backgroundSize: '20px 20px'
    }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="absolute top-0 left-0 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onClick={handleCanvasClick}
      />
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-[#1e1f22] rounded-lg px-6 py-3 shadow-xl">
        <div className="flex items-center gap-6 text-white text-xl font-bold">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[#9b87f5] shadow-lg"></div>
            <span className="tabular-nums">{score.purple}</span>
          </div>
          <span className="text-[#4e5058] text-sm font-medium">VS</span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{score.blue}</span>
            <div className="w-5 h-5 rounded-full bg-[#0EA5E9] shadow-lg"></div>
          </div>
        </div>
      </div>
      {infiniteMode && (
        <div className="absolute top-8 right-8 text-white text-sm bg-muted px-4 py-2 rounded-lg">
          Infinite Mode
        </div>
      )}
    </div>
  );
}