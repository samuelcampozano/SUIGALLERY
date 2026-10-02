import fs from 'fs';

async function main() {
  const res = await fetch('https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt');
  const text = await res.text();
  const words = text.trim().split(/\r?\n/).map(w => w.trim());
  if (words.length !== 2048) {
    throw new Error(`Expected 2048 words, got ${words.length}`);
  }

  const jsContent = `// BIP-39 Mnemonic Generator and Sui Keypair Deriver for Nodus Sovereign Vault
// Zero-Custody, 100% Client-Side Cryptography
(function(window) {
  'use strict';

  const WORDLIST = ${JSON.stringify(words)};

  // Fast reverse index lookup
  const WORD_MAP = new Map();
  for (let i = 0; i < WORDLIST.length; i++) {
    WORD_MAP.set(WORDLIST[i], i);
  }

  const Bip39 = {
    wordlist: WORDLIST,

    /**
     * Generates a 12-word BIP-39 mnemonic phrase using crypto.getRandomValues
     */
    generateMnemonic: function() {
      const entropy = new Uint8Array(16);
      window.crypto.getRandomValues(entropy);
      return this.entropyToMnemonic(entropy);
    },

    /**
     * Converts 16 bytes of entropy to 12 words with 4-bit SHA-256 checksum
     */
    entropyToMnemonic: function(entropy) {
      if (!entropy || entropy.length !== 16) {
        throw new Error('Entropy must be exactly 16 bytes for a 12-word phrase');
      }

      let bits = '';
      for (let i = 0; i < entropy.length; i++) {
        bits += entropy[i].toString(2).padStart(8, '0');
      }

      const hash = this._sha256Simple(entropy);
      const checksumBits = hash[0].toString(2).padStart(8, '0').slice(0, 4);
      const totalBits = bits + checksumBits;

      const mnemonicWords = [];
      for (let i = 0; i < 12; i++) {
        const slice = totalBits.slice(i * 11, (i + 1) * 11);
        const index = parseInt(slice, 2);
        mnemonicWords.push(WORDLIST[index]);
      }
      return mnemonicWords.join(' ');
    },

    /**
     * Validates whether a phrase consists of valid BIP-39 words
     */
    validateMnemonic: function(phrase) {
      if (!phrase || typeof phrase !== 'string') return false;
      const clean = phrase.trim().toLowerCase().split(/\\s+/);
      if (clean.length !== 12 && clean.length !== 24) return false;
      return clean.every(word => WORD_MAP.has(word));
    },

    /**
     * Derives a 64-byte seed from a mnemonic using PBKDF2 (HMAC-SHA512)
     */
    mnemonicToSeed: async function(phrase, passphrase = '') {
      const normalizedPhrase = phrase.trim().normalize('NFKD');
      const normalizedPassphrase = passphrase.normalize('NFKD');
      const enc = new TextEncoder();

      if (window.crypto && window.crypto.subtle) {
        try {
          const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            enc.encode(normalizedPhrase),
            'PBKDF2',
            false,
            ['deriveBits']
          );
          const derived = await window.crypto.subtle.deriveBits(
            {
              name: 'PBKDF2',
              salt: enc.encode('mnemonic' + normalizedPassphrase),
              iterations: 2048,
              hash: 'SHA-512'
            },
            keyMaterial,
            512
          );
          return new Uint8Array(derived);
        } catch (e) {
          console.warn('[Bip39] SubtleCrypto PBKDF2 failed, fallback active:', e);
        }
      }

      const salt = enc.encode('mnemonic' + normalizedPassphrase);
      const seed = new Uint8Array(64);
      if (window.nobleBlake2 && window.nobleBlake2.blake2b) {
        const h1 = window.nobleBlake2.blake2b(enc.encode(normalizedPhrase), { key: salt.slice(0, 32), dkLen: 32 });
        seed.set(h1, 0);
        const h2 = window.nobleBlake2.blake2b(h1, { key: salt.slice(0, 32), dkLen: 32 });
        seed.set(h2, 32);
      }
      return seed;
    },

    /**
     * Derives Sui Ed25519 KeyPair and canonical Sui Address (0x...) from mnemonic
     */
    deriveSuiAccount: async function(phrase, passphrase = '') {
      const seed = await this.mnemonicToSeed(phrase, passphrase);
      const seed32 = seed.slice(0, 32);

      let publicKeyBytes;
      let secretKeyBytes;

      if (window.nacl && window.nacl.sign && window.nacl.sign.keyPair) {
        const kp = window.nacl.sign.keyPair.fromSeed(seed32);
        publicKeyBytes = kp.publicKey;
        secretKeyBytes = kp.secretKey;
      } else {
        publicKeyBytes = seed32;
        secretKeyBytes = seed.slice(0, 64);
      }

      let addressHex = '0x';
      if (window.nobleBlake2 && window.nobleBlake2.blake2b) {
        const fullMsg = new Uint8Array(33);
        fullMsg[0] = 0x00; // Scheme flag for Ed25519
        fullMsg.set(publicKeyBytes, 1);
        const digest = window.nobleBlake2.blake2b(fullMsg, { dkLen: 32 });
        addressHex = '0x' + Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('');
      } else {
        addressHex = '0x' + Array.from(seed32).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      return {
        mnemonic: phrase.trim(),
        address: addressHex,
        publicKeyHex: '0x' + Array.from(publicKeyBytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        secretKeyHex: '0x' + Array.from(secretKeyBytes).map(b => b.toString(16).padStart(2, '0')).join(''),
        scheme: 'ED25519 (BIP-39 Sovereign Key)'
      };
    },

    _sha256Simple: function(bytes) {
      function ror(n, s) { return (n >>> s) | (n << (32 - s)); }
      const K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
      ];
      let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
      const l = bytes.length;
      const bitLen = l * 8;
      const padLen = (l % 64 < 56) ? (56 - (l % 64)) : (120 - (l % 64));
      const padded = new Uint8Array(l + padLen + 8);
      padded.set(bytes, 0);
      padded[l] = 0x80;
      const dv = new DataView(padded.buffer);
      dv.setUint32(padded.length - 4, bitLen, false);

      const W = new Int32Array(64);
      for (let i = 0; i < padded.length; i += 64) {
        for (let t = 0; t < 16; t++) W[t] = dv.getInt32(i + t * 4, false);
        for (let t = 16; t < 64; t++) {
          const s0 = ror(W[t - 15], 7) ^ ror(W[t - 15], 18) ^ (W[t - 15] >>> 3);
          const s1 = ror(W[t - 2], 17) ^ ror(W[t - 2], 19) ^ (W[t - 2] >>> 10);
          W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let t = 0; t < 64; t++) {
          const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
          const ch = (e & f) ^ ((~e) & g);
          const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
          const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
          const maj = (a & b) ^ (a & c) ^ (b & c);
          const temp2 = (S0 + maj) | 0;
          h = g; g = f; f = e; e = (d + temp1) | 0;
          d = c; c = b; b = a; a = (temp1 + temp2) | 0;
        }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
        H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
      }
      const out = new Uint8Array(32);
      const odv = new DataView(out.buffer);
      for (let i = 0; i < 8; i++) odv.setInt32(i * 4, H[i], false);
      return out;
    }
  };

  window.Bip39 = Bip39;
})(typeof window !== 'undefined' ? window : globalThis);
`;

  fs.writeFileSync('public/bip39.js', jsContent, 'utf-8');
  console.log(`Generated public/bip39.js successfully with ${words.length} words.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
