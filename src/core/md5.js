  // RFC 1321 byte-oriented MD5, used only as a content cache fingerprint.
  function* imageMd5Steps(input) {
    const bytes = input instanceof Uint8Array ? input : ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
    const length = bytes.byteLength;
    const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
    padded.set(bytes);
    padded[length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, (length * 8) >>> 0, true);
    view.setUint32(padded.length - 4, Math.floor(length / 0x20000000), true);
    const rotations = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000));
    const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    for (let offset = 0; offset < padded.length; offset += 64) {
      let [a, b, c, d] = state;
      for (let index = 0; index < 64; index += 1) {
        let value;
        let word;
        if (index < 16) { value = (b & c) | (~b & d); word = index; }
        else if (index < 32) { value = (d & b) | (~d & c); word = (5 * index + 1) % 16; }
        else if (index < 48) { value = b ^ c ^ d; word = (3 * index + 5) % 16; }
        else { value = c ^ (b | ~d); word = (7 * index) % 16; }
        const shift = rotations[Math.floor(index / 16) * 4 + index % 4];
        const sum = (a + value + constants[index] + view.getUint32(offset + word * 4, true)) | 0;
        const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
        a = d; d = c; c = b; b = next;
      }
      state[0] = (state[0] + a) | 0; state[1] = (state[1] + b) | 0;
      state[2] = (state[2] + c) | 0; state[3] = (state[3] + d) | 0;
      // Bound each main-thread slice to 64KiB; sync callers consume without yielding.
      if (offset && offset % 65536 === 0) yield;
    }
    return state.map((word) => [0, 8, 16, 24].map((shift) => ((word >>> shift) & 255).toString(16).padStart(2, "0")).join("")).join("");
  }

  function imageBytesMd5(input) {
    const steps = imageMd5Steps(input);
    let result;
    do { result = steps.next(); } while (!result.done);
    return result.value;
  }

  async function imageBytesMd5Async(input, signal) {
    const steps = imageMd5Steps(input);
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const result = steps.next();
      if (result.done) return result.value;
      if (globalThis.scheduler?.postTask) await globalThis.scheduler.postTask(() => {}, { priority: "background" });
      else await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
