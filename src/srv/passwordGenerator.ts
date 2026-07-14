import crypto from "crypto";

const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL_CHARS = LOWERCASE + UPPERCASE + DIGITS;

export function generatePassword(length: number = 12): string {
    if (length < 8) {
        length = 8;
    }

    const bytes = crypto.randomBytes(length);
    let password = "";

    for (let i = 0; i < length; i++) {
        password += ALL_CHARS[bytes[i] % ALL_CHARS.length];
    }

    if (!/[A-Z]/.test(password)) {
        password = password.slice(0, -1) + UPPERCASE[bytes[length - 1] % UPPERCASE.length];
    }
    if (!/[0-9]/.test(password)) {
        const pos = bytes[0] % (length - 1);
        password = password.slice(0, pos) + DIGITS[bytes[1] % DIGITS.length] + password.slice(pos + 1);
    }

    return password;
}