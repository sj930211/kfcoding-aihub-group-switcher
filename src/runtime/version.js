  function extractUserscriptVersion(source) {
    const match = String(source || "").match(/^\/\/\s*@version\s+([^\s]+)\s*$/m);
    return match ? match[1].trim() : "";
  }

  function compareVersions(left, right) {
    const leftParts = String(left || "").replace(/^v/i, "").split(".");
    const rightParts = String(right || "").replace(/^v/i, "").split(".");
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = Number.parseInt(leftParts[index] || "0", 10);
      const rightPart = Number.parseInt(rightParts[index] || "0", 10);
      const normalizedLeft = Number.isFinite(leftPart) ? leftPart : 0;
      const normalizedRight = Number.isFinite(rightPart) ? rightPart : 0;
      if (normalizedLeft !== normalizedRight) return normalizedLeft > normalizedRight ? 1 : -1;
    }
    return 0;
  }
