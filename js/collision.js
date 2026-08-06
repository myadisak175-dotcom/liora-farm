const collision = (() => {
  const EPSILON = 0.01;

  function circleIntersectsRect(circleX, circleY, radius, rect) {
    const closestX = Math.max(rect.x, Math.min(circleX, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circleY, rect.y + rect.height));
    const deltaX = circleX - closestX;
    const deltaY = circleY - closestY;
    return deltaX * deltaX + deltaY * deltaY < radius * radius;
  }

  function moveCircle(x, y, deltaX, deltaY, radius, rectangles) {
    let nextX = x + deltaX;

    rectangles.forEach((rect) => {
      if (!circleIntersectsRect(nextX, y, radius, rect)) return;
      if (deltaX > 0) nextX = Math.min(nextX, rect.x - radius - EPSILON);
      else if (deltaX < 0) nextX = Math.max(nextX, rect.x + rect.width + radius + EPSILON);
    });

    let nextY = y + deltaY;
    rectangles.forEach((rect) => {
      if (!circleIntersectsRect(nextX, nextY, radius, rect)) return;
      if (deltaY > 0) nextY = Math.min(nextY, rect.y - radius - EPSILON);
      else if (deltaY < 0) nextY = Math.max(nextY, rect.y + rect.height + radius + EPSILON);
    });

    return { x: nextX, y: nextY };
  }

  return { circleIntersectsRect, moveCircle };
})();
