// Type-only imports: erased at build time, so no server code reaches the browser bundle.
import type { sharedSummary, sharedView, RoundResult } from '../services/play';
import type { roomState } from '../services/rooms';
import type { gameMeta, HostPuzzle, hostSetupView, puzzleInfo } from '../services/games';

export type { RoundResult, HostPuzzle };
export type GameMeta = ReturnType<typeof gameMeta>;
export type SharedView = Awaited<ReturnType<typeof sharedView>>;
export type SharedSummary = Awaited<ReturnType<typeof sharedSummary>>;
export type HostSetup = ReturnType<typeof hostSetupView>;
export type RoomState = ReturnType<typeof roomState>;
export type Pin = { lat: number; lng: number };
export type PhotoInfo = ReturnType<typeof puzzleInfo>;
