import EventEmitter from "events";

export interface CooldownOptions {
    /* How long the cooldown takes to expire */
    time: number;
}

export interface CooldownState {
    active: boolean;

    startedAt: number | null;
    expiresIn: number | null;
}

export class Cooldown extends EventEmitter {
    /* Information about the cooldown */
    private readonly options: CooldownOptions;

    /* Whether the cooldown is active */
    public state: CooldownState;

    /* Timer for the cooldown */
    private timer: NodeJS.Timeout | null;

    constructor(options: CooldownOptions) {
        super();
        this.options = options;

        this.state = { active: false, startedAt: null, expiresIn: null };
        this.timer = null;
    }
    
    /**
     * Activate the cooldown.
     * @param time Expiration time override to use
     * 
     * @returns When the cooldown expires
     */
    public use(time?: number): number {
        /* Set up the time-out. */
        this.timer = setTimeout(() => {
            this.state = {
                active: false,

                startedAt: null,
                expiresIn: null
            };

            this.emit("done");
        }, time ?? this.options.time);

        this.state = {
            active: true,

            startedAt: Date.now(),  
            expiresIn: (time ?? this.options.time)
        };

        return this.state.expiresIn!;
    }

    public get active(): boolean {
        return this.state && this.state.active;
    }

    /**
     * Cancel the currently running cooldown, if there is any in the first place.
     * @returns Whether a cool-down was stopped
     */
    public cancel(): boolean {
        /* Whether a cool-down is currently active. */
        const active: boolean = this.state.active;
        if (!active) return false;

        /* Stop the cool-down. */
        this.state = {
            active: false,

            startedAt: null,
            expiresIn: null
        };

        clearTimeout(this.timer!);
        this.emit("done");

        return true;
    }
}