import crypto from "crypto";

const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL_CHARS = LOWERCASE + UPPERCASE + DIGITS;

function randomChar(charset: string): string {
    return charset[crypto.randomInt(charset.length)];
}

export function generatePassword(length: number = 12): string {
    if (length < 8) {
        length = 8;
    }

    let password = "";
    for (let i = 0; i < length; i++) {
        password += randomChar(ALL_CHARS);
    }

    if (!/[A-Z]/.test(password)) {
        password = password.slice(0, -1) + randomChar(UPPERCASE);
    }
    if (!/[0-9]/.test(password)) {
        const pos = crypto.randomInt(length - 1);
        password = password.slice(0, pos) + randomChar(DIGITS) + password.slice(pos + 1);
    }

    return password;
}