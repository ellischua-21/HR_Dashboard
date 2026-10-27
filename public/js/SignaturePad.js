window.createSignaturePad = function createSignaturePad(canvas, clearButton) {
  const context = canvas.getContext('2d');
  let hasSignature = false;
  let drawing = false;

  function clear() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, bounds.width, bounds.height);
    context.strokeStyle = '#14213d';
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    hasSignature = false;
  }

  function position(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const point = position(event);
    context.beginPath();
    context.arc(point.x, point.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fillStyle = context.strokeStyle;
    context.fill();
    context.beginPath();
    context.moveTo(point.x, point.y);
    hasSignature = true;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const point = position(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    hasSignature = true;
  });
  const stopDrawing = () => {
    drawing = false;
  };
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  clearButton.addEventListener('click', clear);
  clear();

  return {
    clear,
    hasSignature: () => hasSignature,
    toDataURL: () => {
      if (!hasSignature) return '';
      const { data, width, height } = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );
      let minX = width,
        minY = height,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const offset = (y * width + x) * 4;
          if (
            data[offset] < 245 ||
            data[offset + 1] < 245 ||
            data[offset + 2] < 245
          ) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      if (maxX < minX || maxY < minY) return '';
      const output = document.createElement('canvas');
      output.width = 560;
      output.height = 112;
      const outputContext = output.getContext('2d');
      outputContext.fillStyle = '#fff';
      outputContext.fillRect(0, 0, output.width, output.height);
      const sourceWidth = maxX - minX + 1;
      const sourceHeight = maxY - minY + 1;
      const scale = Math.min(520 / sourceWidth, 90 / sourceHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      outputContext.drawImage(
        canvas,
        minX,
        minY,
        sourceWidth,
        sourceHeight,
        (output.width - drawWidth) / 2,
        (output.height - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
      return output.toDataURL('image/png');
    }
  };
};
