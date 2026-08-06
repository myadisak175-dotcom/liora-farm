export const houseInteriorMap = (() => {
  const WIDTH = 900;
  const HEIGHT = 700;
  const ROOM = Object.freeze({ x: 90, y: 75, width: 720, height: 540 });
  const WALL = 34;
  const DOOR_CENTER_X = 450;
  const DOOR_WIDTH = 120;

  const FURNITURE = [
    {
      id: "bed",
      x: 145,
      y: 150,
      width: 210,
      height: 135,
      depthY: 285,
      collider: { x: 150, y: 166, width: 200, height: 112 },
    },
    {
      id: "table",
      x: 500,
      y: 300,
      width: 150,
      height: 105,
      depthY: 405,
      collider: { x: 515, y: 326, width: 120, height: 70 },
    },
    {
      id: "cabinet",
      x: 650,
      y: 130,
      width: 105,
      height: 150,
      depthY: 280,
      collider: { x: 656, y: 166, width: 93, height: 108 },
    },
  ];

  const COLLIDERS = [
    { x: ROOM.x, y: ROOM.y, width: ROOM.width, height: WALL },
    { x: ROOM.x, y: ROOM.y, width: WALL, height: ROOM.height },
    { x: ROOM.x + ROOM.width - WALL, y: ROOM.y, width: WALL, height: ROOM.height },
    {
      x: ROOM.x,
      y: ROOM.y + ROOM.height - WALL,
      width: DOOR_CENTER_X - DOOR_WIDTH / 2 - ROOM.x,
      height: WALL,
    },
    {
      x: DOOR_CENTER_X + DOOR_WIDTH / 2,
      y: ROOM.y + ROOM.height - WALL,
      width: ROOM.x + ROOM.width - (DOOR_CENTER_X + DOOR_WIDTH / 2),
      height: WALL,
    },
    { x: DOOR_CENTER_X - DOOR_WIDTH / 2, y: ROOM.y + ROOM.height, width: DOOR_WIDTH, height: 20 },
    ...FURNITURE.map((item) => item.collider),
  ];

  function drawGround(ctx) {
    ctx.fillStyle = "#9c744d";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = "#d8b984";
    ctx.fillRect(ROOM.x, ROOM.y, ROOM.width, ROOM.height);

    ctx.strokeStyle = "rgba(104, 72, 45, 0.18)";
    ctx.lineWidth = 2;
    for (let y = ROOM.y + 26; y < ROOM.y + ROOM.height; y += 34) {
      ctx.beginPath();
      ctx.moveTo(ROOM.x, y);
      ctx.lineTo(ROOM.x + ROOM.width, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#68442d";
    ctx.fillRect(ROOM.x, ROOM.y, ROOM.width, WALL);
    ctx.fillRect(ROOM.x, ROOM.y, WALL, ROOM.height);
    ctx.fillRect(ROOM.x + ROOM.width - WALL, ROOM.y, WALL, ROOM.height);
    ctx.fillRect(
      ROOM.x,
      ROOM.y + ROOM.height - WALL,
      DOOR_CENTER_X - DOOR_WIDTH / 2 - ROOM.x,
      WALL,
    );
    ctx.fillRect(
      DOOR_CENTER_X + DOOR_WIDTH / 2,
      ROOM.y + ROOM.height - WALL,
      ROOM.x + ROOM.width - (DOOR_CENTER_X + DOOR_WIDTH / 2),
      WALL,
    );

    ctx.fillStyle = "#8d5c34";
    ctx.fillRect(DOOR_CENTER_X - DOOR_WIDTH / 2, ROOM.y + ROOM.height - 12, DOOR_WIDTH, 24);

    ctx.fillStyle = "rgba(255, 240, 185, 0.22)";
    ctx.fillRect(390, 109, 120, 170);
  }

  function drawFurniture(ctx, item) {
    if (item.id === "bed") {
      ctx.fillStyle = "#6d4935";
      ctx.fillRect(item.x, item.y, item.width, item.height);
      ctx.fillStyle = "#efe4cd";
      ctx.fillRect(item.x + 12, item.y + 12, item.width - 24, 42);
      ctx.fillStyle = "#b75c58";
      ctx.fillRect(item.x + 12, item.y + 60, item.width - 24, item.height - 72);
      return;
    }

    if (item.id === "table") {
      ctx.fillStyle = "#765034";
      ctx.beginPath();
      ctx.roundRect(item.x, item.y, item.width, item.height, 18);
      ctx.fill();
      ctx.fillStyle = "#d8b06f";
      ctx.beginPath();
      ctx.arc(item.x + 48, item.y + 45, 18, 0, Math.PI * 2);
      ctx.arc(item.x + 102, item.y + 55, 14, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.fillStyle = "#5c4435";
    ctx.fillRect(item.x, item.y, item.width, item.height);
    ctx.strokeStyle = "#ba9466";
    ctx.lineWidth = 3;
    ctx.strokeRect(item.x + 8, item.y + 8, item.width - 16, item.height - 16);
    ctx.beginPath();
    ctx.moveTo(item.x + item.width / 2, item.y + 10);
    ctx.lineTo(item.x + item.width / 2, item.y + item.height - 10);
    ctx.stroke();
  }

  function drawBefore(ctx, playerY) {
    FURNITURE
      .filter((item) => item.depthY <= playerY)
      .forEach((item) => drawFurniture(ctx, item));
  }

  function drawAfter(ctx, playerY) {
    FURNITURE
      .filter((item) => item.depthY > playerY)
      .forEach((item) => drawFurniture(ctx, item));
  }

  function getColliders() {
    return COLLIDERS;
  }

  return {
    WIDTH,
    HEIGHT,
    ROOM,
    DOOR_CENTER_X,
    drawGround,
    drawBefore,
    drawAfter,
    getColliders,
  };
})();
