  function extractUserscriptVersion(source) {
    const match = String(source || "").match(/^\/\/\s*@version\s+([^\s]+)\s*$/m);
    return match && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(match[1]) ? match[1] : "";
  }

  function compareVersions(left, right) {
    const normalizedLeftVersion = String(left || "").replace(/^v/i, "");
    const normalizedRightVersion = String(right || "").replace(/^v/i, "");
    // Legacy shortened numeric versions remain comparable; only stable releases enter the update channel.
    const numericVersion = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,2}$/;
    if (!numericVersion.test(normalizedLeftVersion) || !numericVersion.test(normalizedRightVersion)) return 0;
    const leftParts = normalizedLeftVersion.split(".");
    const rightParts = normalizedRightVersion.split(".");
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
