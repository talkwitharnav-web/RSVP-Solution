import { customAlphabet } from "nanoid";

const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";

export const generateSlug = customAlphabet(alphabet, 8);
