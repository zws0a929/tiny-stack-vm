// Tiny stack VM entry (make.fun ISA v1; reference vm.mjs authoritative).
// Runs each /input/<id>/program.bin, writes /output/<id>/stdout.bin + exit.txt.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const STACK_MAX = 256, CALL_MAX = 64, MEM_WORDS = 256;
const STEP_LIMIT = 1000000, OUTPUT_MAX = 65536;

// Opcode table: [byte, immediate bytes, values popped, values pushed].
const SPEC = {};
for (const e of [[0,0,0,0],[1,1,0,1],[2,4,0,1],[3,0,1,0],[4,0,1,2],[5,0,2,2],
[6,0,2,3],[7,0,3,3],[16,0,2,1],[17,0,2,1],[18,0,2,1],[19,0,2,1],[20,0,2,1],
[21,0,2,1],[22,0,2,1],[23,0,1,1],[24,0,2,1],[25,0,2,1],[26,0,2,1],[27,0,1,1],
[28,0,2,1],[29,0,2,1],[30,0,2,1],[32,0,2,1],[33,0,2,1],[34,0,2,1],[48,2,0,0],
[49,2,1,0],[50,2,1,0],[51,2,0,0],[52,0,0,0],[64,0,1,1],[65,0,2,0],[80,0,1,0],
[81,0,1,0],[82,0,0,1],[83,0,1,0]]) SPEC[e[0]] = e.slice(1);

// Runs one program on its input; returns bytes written and exit code
// (a trap's code when it trapped; a trapping instruction writes nothing).
function runProgram(program, input) {
  const stack = new Int32Array(STACK_MAX);
  const calls = new Int32Array(CALL_MAX);
  const mem = new Int32Array(MEM_WORDS);
  const out = new Uint8Array(OUTPUT_MAX);
  let sp = 0, cp = 0, pc = 0, steps = 0, outLen = 0, inPos = 0;
  const n = program.length;
  const done = (exit) => ({ out: out.slice(0, outLen), exit });

  for (;;) {
    // ISA step order: step limit, pc, opcode, immediate, stack needs, then
    // the instruction's own traps.
    if (steps === STEP_LIMIT) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = program[pc];
    const spec = SPEC[op];
    if (spec === undefined) return done(5);
    const imm = spec[0];
    if (pc + imm >= n) return done(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < spec[1]) return done(2);
    if (sp - spec[1] + spec[2] > STACK_MAX) return done(3);
    pc = next;

    if (op === 0x00) return done(0);
    if (op === 0x01) { // PUSH8: byte as signed 8-bit, sign-extended
      stack[sp++] = (program[next - 1] << 24) >> 24;
      continue;
    }
    if (op === 0x02) { // PUSH32: four little-endian bytes, signed 32-bit
      stack[sp++] = program[next - 4] | (program[next - 3] << 8) |
        (program[next - 2] << 16) | (program[next - 1] << 24);
      continue;
    }
    if (op === 0x03) { sp--; continue; }
    if (op === 0x04) { stack[sp] = stack[sp - 1]; sp++; continue; }
    if (op === 0x05) {
      const t = stack[sp - 1];
      stack[sp - 1] = stack[sp - 2];
      stack[sp - 2] = t;
      continue;
    }
    if (op === 0x06) { stack[sp] = stack[sp - 2]; sp++; continue; }
    if (op === 0x07) {
      const a = stack[sp - 3];
      stack[sp - 3] = stack[sp - 2];
      stack[sp - 2] = stack[sp - 1];
      stack[sp - 1] = a;
      continue;
    }
    if (op === 0x17) { stack[sp - 1] = -stack[sp - 1] | 0; continue; }
    if (op === 0x1b) { stack[sp - 1] = ~stack[sp - 1]; continue; }
    if (op === 0x30 || op === 0x31 || op === 0x32) {
      // JMP/JZ/JNZ: signed 16-bit LE offset from the next instruction.
      // Target unchecked here; out of range traps 9 at the next step.
      const rel = ((program[next - 2] | (program[next - 1] << 8)) << 16) >> 16;
      let take = true;
      if (op !== 0x30) {
        const v = stack[--sp];
        take = op === 0x31 ? v === 0 : v !== 0;
      }
      if (take) pc = next + rel;
      continue;
    }
    if (op === 0x33) { // CALL: 64 held already traps 7
      if (cp === CALL_MAX) return done(7);
      calls[cp++] = next;
      pc = program[next - 2] | (program[next - 1] << 8);
      continue;
    }
    if (op === 0x34) { // RET: empty call stack traps 8
      if (cp === 0) return done(8);
      pc = calls[--cp];
      continue;
    }
    if (op === 0x40) { // LOAD: address outside 0..255 traps 6
      const addr = stack[sp - 1];
      if (addr < 0 || addr >= MEM_WORDS) return done(6);
      stack[sp - 1] = mem[addr];
      continue;
    }
    if (op === 0x41) { // STORE ( v addr -- ): address outside 0..255 traps 6
      const addr = stack[sp - 1], v = stack[sp - 2];
      if (addr < 0 || addr >= MEM_WORDS) return done(6);
      sp -= 2;
      mem[addr] = v;
      continue;
    }
    if (op === 0x50) { // PRINT: decimal ASCII; over the limit writes nothing
      const text = String(stack[sp - 1]);
      if (outLen + text.length > OUTPUT_MAX) return done(11);
      sp--;
      for (let i = 0; i < text.length; i++) out[outLen++] = text.charCodeAt(i);
      continue;
    }
    if (op === 0x51) { // PUTC: one byte, the low byte of the value
      if (outLen + 1 > OUTPUT_MAX) return done(11);
      out[outLen++] = stack[--sp] & 255;
      continue;
    }
    if (op === 0x52) { // IN: next byte, or -1 once the input is used up
      stack[sp++] = inPos < input.length ? input[inPos++] : -1;
      continue;
    }
    if (op === 0x53) return done(stack[--sp] & 255);
    // Two-operand ops: b is the top, a below it.
    const b = stack[sp - 1], a = stack[sp - 2];
    let r;
    if (op === 0x10) r = (a + b) | 0; // ADD wraps
    else if (op === 0x11) r = (a - b) | 0; // SUB wraps
    else if (op === 0x12) r = Math.imul(a, b); // MUL: low 32 bits
    else if (op === 0x13) {
      if (b === 0) return done(4);
      r = a === -2147483648 && b === -1 ? a : (a / b) | 0; // INT_MIN/-1 = INT_MIN
    } else if (op === 0x14) {
      if (b === 0) return done(4);
      r = b === -1 ? 0 : (a % b) | 0; // remainder takes the sign of a
    } else if (op === 0x15) {
      if (b === 0) return done(4);
      r = Math.floor((a >>> 0) / (b >>> 0)) | 0; // DIVU: unsigned quotient
    } else if (op === 0x16) {
      if (b === 0) return done(4);
      r = ((a >>> 0) % (b >>> 0)) | 0; // MODU: unsigned remainder
    } else if (op === 0x18) r = a & b;
    else if (op === 0x19) r = a | b;
    else if (op === 0x1a) r = a ^ b;
    else if (op === 0x1c) r = a << (b & 31); // SHL: only low 5 bits count
    else if (op === 0x1d) r = a >> (b & 31); // SHR: arithmetic
    else if (op === 0x1e) r = (a >>> (b & 31)) | 0; // SHRU: logical
    else if (op === 0x20) r = a === b ? 1 : 0;
    else if (op === 0x21) r = a < b ? 1 : 0; // signed
    else if (op === 0x22) r = (a >>> 0) < (b >>> 0) ? 1 : 0; // unsigned
    else return done(5); // unreachable: SPEC already rejected unknown bytes
    sp -= 2;
    stack[sp++] = r;
  }
}

// One instance per directory under the input directory.
for (const id of readdirSync(INPUT_DIR).sort()) {
  const program = readFileSync(join(INPUT_DIR, id, "program.bin"));
  const input = readFileSync(join(INPUT_DIR, id, "input.bin"));
  const { out, exit } = runProgram(program, input);
  mkdirSync(join(OUTPUT_DIR, id), { recursive: true });
  writeFileSync(join(OUTPUT_DIR, id, "stdout.bin"), out);
  writeFileSync(join(OUTPUT_DIR, id, "exit.txt"), exit + "\n");
}
