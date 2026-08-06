export const gameMap = (() => {
  const OBJECTS = [
    {
      id: "farmhouse",
      type: "house",
      x: 220,
      y: 180,
      width: 260,
      height: 210,
      depthY: 390,
      collision: { x: 245, y: 322, width: 210, height: 68 },
    },
    { id: "tree-north-east", type: "tree", x: 1260, y: 280, scale: 1.12 },
    { id: "tree-east", type: "tree", x: 1370, y: 650, scale: 1 },
    { id: "tree-south-east", type: "tree", x: 1190, y: 990, scale: 1.18 },
    { id: "tree-south-west", type: "tree", x: 340, y: 930, scale: 1.08 },
    { id: "tree-west", type: "tree", x: 150, y: 620, scale: 0.96 },
    { id: "well", type: "well", x: 1135, y: 535, depthY: 570, collision: { x: 1094, y: 513, width: 82, height: 56 } },
    { id: "rock-west", type: "rock", x: 470, y: 565, scale: 1.05 },
    { id: "rock-east", type: "rock", x: 1260, y: 875, scale: 0.9 },
    { id: "fence-top", type: "fence", x: 620, y: 310, width: 360, height: 18, orientation: "horizontal" },
    { id: "fence-left", type: "fence", x: 610, y: 310, width: 18, height: 370, orientation: "vertical" },
    { id: "fence-right", type: "fence", x: 972, y: 310, width: 18, height: 370, orientation: "vertical" },
    { id: "fence-bottom-left", type: "fence", x: 620, y: 662, width: 126, height: 18, orientation: "horizontal" },
    { id: "fence-bottom-right", type: "fence", x: 854, y: 662, width: 126, height: 18, orientation: "horizontal" },
  ];

  const GROUND_DETAILS = [
    { x: 530, y: 250, color: "#f6d56b" },
    { x: 545, y: 265, color: "#fff1a8" },
    { x: 1080, y: 340, color: "#f0a6bd" },
    { x: 1100, y: 325, color: "#fff1a8" },
    { x: 425, y: 1030, color: "#f6d56b" },
    { x: 1320, y: 1050, color: "#f0a6bd" },
  ];

  OBJECTS.forEach((object) => {
    if (object.type === "tree") {
      const scale = object.scale ?? 1;
      object.depthY = object.y + 18 * scale;
      object.collision = {
        x: object.x - 23 * scale,
        y: object.y - 16 * scale,
        width: 46 * scale,
        height: 36 * scale,
      };
    }

    if (object.type === "rock") {
      const scale = object.scale ?? 1;
      object.depthY = object.y + 13 * scale;
      object.collision = {
        x: object.x - 28 * scale,
        y: object.y - 15 * scale,
        width: 56 * scale,
        height: 30 * scale,
      };
    }

    if (object.type === "fence") {
      object.depthY = object.y + object.height;
      object.collision = {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
      };
    }
  });

  const SORTED_OBJECTS = [...OBJECTS].sort((first, second) => first.depthY - second.depthY);
  const COLLIDERS = OBJECTS.filter((object) => object.collision).map((object) => ({
    ...object.collision,
    id: object.id,
  }));

  function drawFlower(ctx, flower) {
    ctx.fillStyle = "#3f7f42";
    ctx.fillRect(flower.x - 1, flower.y, 2, 8);
    ctx.fillStyle = flower.color;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
      ctx.beginPath();
      ctx.arc(flower.x + Math.cos(angle) * 4, flower.y + Math.sin(angle) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f7c84b";
    ctx.beginPath();
    ctx.arc(flower.x, flower.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround(ctx) {
    GROUND_DETAILS.forEach((flower) => drawFlower(ctx, flower));

    ctx.fillStyle = "rgba(96, 67, 36, 0.28)";
    ctx.beginPath();
    ctx.ellipse(800, 705, 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHouse(ctx, object) {
    const { x, y, width, height } = object;
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(22, 35, 28, 0.22)";
    ctx.beginPath();
    ctx.ellipse(width / 2, height + 10, width * 0.48, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f2d3a0";
    ctx.fillRect(20, 78, width - 40, height - 78);

    ctx.fillStyle = "#8f4f3f";
    ctx.beginPath();
    ctx.moveTo(0, 88);
    ctx.lineTo(width / 2, 5);
    ctx.lineTo(width, 88);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6d392f";
    ctx.fillRect(26, 78, width - 52, 16);

    ctx.fillStyle = "#835333";
    ctx.fillRect(width / 2 - 26, height - 78, 52, 78);
    ctx.fillStyle = "#f6d56b";
    ctx.beginPath();
    ctx.arc(width / 2 + 15, height - 38, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8bc3d9";
    ctx.fillRect(48, 118, 48, 42);
    ctx.fillRect(width - 96, 118, 48, 42);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 4;
    [72, width - 72].forEach((centerX) => {
      ctx.beginPath();
      ctx.moveTo(centerX, 118);
      ctx.lineTo(centerX, 160);
      ctx.moveTo(centerX - 24, 139);
      ctx.lineTo(centerX + 24, 139);
      ctx.stroke();
    });

    ctx.fillStyle = "#745142";
    ctx.fillRect(width - 65, 23, 25, 55);
    ctx.restore();
  }

  function drawTree(ctx, object) {
    const scale = object.scale ?? 1;
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.scale(scale, scale);

    ctx.fillStyle = "rgba(18, 35, 25, 0.24)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 42, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#704526";
    ctx.fillRect(-10, -54, 20, 65);
    ctx.fillStyle = "#467f43";
    [[0, -78, 47], [-28, -60, 36], [30, -58, 38], [0, -40, 42]].forEach(([x, y, radius]) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#6ca85e";
    ctx.beginPath();
    ctx.arc(-12, -82, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFence(ctx, object) {
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.fillStyle = "rgba(35, 30, 22, 0.22)";
    ctx.fillRect(3, 5, object.width, object.height);
    ctx.fillStyle = "#aa7746";

    if (object.orientation === "horizontal") {
      ctx.fillRect(0, 5, object.width, 7);
      for (let x = 0; x <= object.width - 8; x += 38) ctx.fillRect(x, 0, 8, object.height);
    } else {
      ctx.fillRect(5, 0, 7, object.height);
      for (let y = 0; y <= object.height - 8; y += 38) ctx.fillRect(0, y, object.width, 8);
    }
    ctx.restore();
  }

  function drawWell(ctx, object) {
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.fillStyle = "rgba(20, 32, 28, 0.23)";
    ctx.beginPath();
    ctx.ellipse(0, 28, 52, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9c8b74";
    ctx.fillRect(-42, -4, 84, 40);
    ctx.fillStyle = "#5b8eaa";
    ctx.beginPath();
    ctx.ellipse(0, -4, 42, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c4b59d";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(0, -4, 42, 16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#7b4e2c";
    ctx.fillRect(-38, -65, 8, 60);
    ctx.fillRect(30, -65, 8, 60);
    ctx.fillRect(-38, -65, 76, 8);
    ctx.restore();
  }

  function drawRock(ctx, object) {
    const scale = object.scale ?? 1;
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(20, 30, 25, 0.2)";
    ctx.beginPath();
    ctx.ellipse(0, 13, 34, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#89908a";
    ctx.beginPath();
    ctx.moveTo(-30, 9);
    ctx.lineTo(-20, -15);
    ctx.lineTo(4, -25);
    ctx.lineTo(28, -8);
    ctx.lineTo(32, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawObject(ctx, object) {
    if (object.type === "house") drawHouse(ctx, object);
    else if (object.type === "tree") drawTree(ctx, object);
    else if (object.type === "fence") drawFence(ctx, object);
    else if (object.type === "well") drawWell(ctx, object);
    else if (object.type === "rock") drawRock(ctx, object);
  }

  function drawBefore(ctx, playerDepthY) {
    SORTED_OBJECTS.forEach((object) => {
      if (object.depthY <= playerDepthY) drawObject(ctx, object);
    });
  }

  function drawAfter(ctx, playerDepthY) {
    SORTED_OBJECTS.forEach((object) => {
      if (object.depthY > playerDepthY) drawObject(ctx, object);
    });
  }

  function getColliders() {
    return COLLIDERS;
  }

  return { drawGround, drawBefore, drawAfter, getColliders };
})();
