export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'number') {
        return `Error code: ${error}`;
    }
    return String(error);
}