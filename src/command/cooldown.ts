export interface CooldownData {
    /* When the cool-down was created */
    createdAt: number;
    
    /* When the cool-down resets again */
    expiresAt: number;
}