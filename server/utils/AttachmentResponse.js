function sendAttachment(res, file) {
  const safeName = file.fileName.replace(/[\r\n"\\]/g, '_');
  const fallbackName = safeName.replace(/[^\x20-\x7E]/g, '_');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', file.fileData.length);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.fileData);
}

module.exports = { sendAttachment };
