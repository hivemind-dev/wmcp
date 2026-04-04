/**
 * @aurorah/wmcp-media-player — Sub-module example (wMCP)
 *
 * Module owns playback state, registers player:* capabilities, calls
 * host:requires for playlist and track services, emits playback events,
 * and listens for playlist:updated from the host.
 */

import { WmcpClient } from '../../src/core/client.js';
import type { WmcpManifest, WmcpMountOptions } from '../../src/core/types.js';
import manifest from './manifest.json';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  coverUrl?: string;
  format?: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

type PlaybackState = 'playing' | 'paused' | 'stopped' | 'buffering';

export interface PlayerStateSnapshot {
  state: PlaybackState;
  currentTrackIndex: number;
  trackId: string | null;
  volume: number;
  repeat: string;
  shuffle: boolean;
}

export class MediaPlayerModule {
  public readonly wmcpClient: WmcpClient;
  private playlist: Playlist | null = null;
  private currentTrackIndex = -1;
  private state: PlaybackState = 'stopped';
  private volume = 0.8;
  private autoplay = false;
  private repeat: 'off' | 'all' | 'one' = 'off';
  private shuffle = false;
  private shuffledOrder: number[] = [];

  private pauseRequested = false;
  private abortPlayback = false;
  private sessionPromise: Promise<void> | null = null;

  constructor() {
    this.wmcpClient = new WmcpClient(manifest as unknown as WmcpManifest);

    this.wmcpClient._registerCapabilities({
      'player:play': async (params) => {
        const trackIndex = params.trackIndex as number;
        if (!this.playlist || trackIndex < 0 || trackIndex >= this.playlist.tracks.length) {
          return { ok: false };
        }
        await this.haltSession();
        this.currentTrackIndex = trackIndex;
        this.sessionPromise = this.runPlaybackSession();
        void this.sessionPromise.finally(() => {
          this.sessionPromise = null;
        });
        return { ok: true };
      },

      'player:pause': async () => {
        if (this.state === 'playing' || this.state === 'buffering') {
          this.pauseRequested = true;
        }
      },

      'player:stop': async () => {
        await this.haltSession();
        this.currentTrackIndex = -1;
        this.setState('stopped');
      },

      'player:getState': async () => this.getStateSnapshot(),

      'player:setVolume': async (params) => {
        this.volume = params.volume as number;
      },
    });

    this.wmcpClient.on('playlist:updated', (data) => {
      const payload = data as { playlistId?: string };
      const id = payload.playlistId ?? this.playlist?.id;
      if (id) {
        void this.refreshPlaylist(id);
      }
    });
  }

  async mount(options?: WmcpMountOptions): Promise<void> {
    const cfg = options?.config ?? {};
    this.volume = (cfg.volume as number) ?? 0.8;
    this.autoplay = (cfg.autoplay as boolean) ?? false;
    const r = cfg.repeat as string | undefined;
    this.repeat = r === 'all' || r === 'one' ? r : 'off';
    this.shuffle = (cfg.shuffle as boolean) ?? false;
    console.log(
      `[PlayerModule] Mounted volume=${this.volume} autoplay=${this.autoplay} repeat=${this.repeat} shuffle=${this.shuffle}`,
    );
  }

  async loadPlaylist(playlistId: string): Promise<Playlist> {
    this.playlist = await this.wmcpClient.call<Playlist>('playlist:load', { playlistId });
    this.rebuildShuffleOrder();
    this.currentTrackIndex = -1;
    this.setState('stopped');
    console.log(`[PlayerModule] Loaded "${this.playlist.name}" (${this.playlist.tracks.length} tracks)`);
    if (this.autoplay && this.playlist.tracks.length > 0) {
      await this.haltSession();
      this.currentTrackIndex = 0;
      this.sessionPromise = this.runPlaybackSession();
      void this.sessionPromise.finally(() => {
        this.sessionPromise = null;
      });
    }
    return this.playlist;
  }

  async addTrack(trackId: string): Promise<void> {
    if (!this.playlist) throw new Error('No playlist loaded');
    this.playlist = await this.wmcpClient.call<Playlist>('playlist:add', {
      playlistId: this.playlist.id,
      trackId,
    });
    this.rebuildShuffleOrder();
    console.log(`[PlayerModule] Added track ${trackId}`);
  }

  async getTrackInfo(trackId: string): Promise<Track> {
    return this.wmcpClient.call<Track>('track:info', { trackId });
  }

  getStateSnapshot(): PlayerStateSnapshot {
    return {
      state: this.state,
      currentTrackIndex: this.currentTrackIndex,
      trackId: this.currentTrack?.id ?? null,
      volume: this.volume,
      repeat: this.repeat,
      shuffle: this.shuffle,
    };
  }

  private get currentTrack(): Track | undefined {
    if (!this.playlist || this.currentTrackIndex < 0) return undefined;
    return this.playlist.tracks[this.currentTrackIndex];
  }

  private rebuildShuffleOrder(): void {
    if (!this.playlist) {
      this.shuffledOrder = [];
      return;
    }
    this.shuffledOrder = this.playlist.tracks.map((_, i) => i);
    if (!this.shuffle) return;
    for (let i = this.shuffledOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledOrder[i], this.shuffledOrder[j]] = [this.shuffledOrder[j], this.shuffledOrder[i]];
    }
  }

  private async refreshPlaylist(playlistId: string): Promise<void> {
    try {
      await this.haltSession();
      this.playlist = await this.wmcpClient.call<Playlist>('playlist:load', { playlistId });
      this.rebuildShuffleOrder();
      if (this.currentTrackIndex >= this.playlist.tracks.length) {
        this.currentTrackIndex = this.playlist.tracks.length > 0 ? this.playlist.tracks.length - 1 : -1;
      }
      this.setState('stopped');
      console.log('[PlayerModule] Refreshed playlist after playlist:updated');
    } catch (e) {
      console.error('[PlayerModule] playlist:updated refresh failed', e);
    }
  }

  private setState(next: PlaybackState): void {
    this.state = next;
    this.wmcpClient.emit('playback:stateChanged', {
      state: next,
      trackId: this.currentTrack?.id ?? '',
    });
  }

  private async haltSession(): Promise<void> {
    this.abortPlayback = true;
    this.pauseRequested = false;
    if (this.sessionPromise) {
      await this.sessionPromise;
    }
    this.abortPlayback = false;
  }

  private async runPlaybackSession(): Promise<void> {
    const track = this.currentTrack;
    if (!track || !this.playlist) return;

    this.pauseRequested = false;
    this.setState('buffering');

    const duration = track.duration;

    try {
      const stream = this.wmcpClient.stream<{ chunk: number; bytes: number; trackId: string }>(
        'track:stream',
        { trackId: track.id },
      );

      this.setState('playing');

      for await (const piece of stream) {
        if (this.abortPlayback) {
          return;
        }
        if (this.pauseRequested) {
          this.pauseRequested = false;
          this.setState('paused');
          return;
        }
        const step = piece.chunk + 1;
        const totalChunks = 3;
        const currentTime = (duration / totalChunks) * step;
        this.wmcpClient.emit('playback:progress', {
          trackId: track.id,
          currentTime,
          duration,
          percentage: Math.round((step / totalChunks) * 100),
        });
      }
    } catch (e) {
      console.error('[PlayerModule] track:stream error', e);
      this.setState('stopped');
      return;
    }

    if (this.abortPlayback) return;

    const nextId = this.nextTrackAfterCurrent()?.id ?? '';
    this.wmcpClient.emit('track:ended', { trackId: track.id, nextTrackId: nextId });

    const next = this.advanceAfterTrackEnd();
    if (next !== null) {
      this.currentTrackIndex = next;
      this.sessionPromise = this.runPlaybackSession();
      await this.sessionPromise;
    } else {
      this.setState('stopped');
    }
  }

  private nextTrackAfterCurrent(): Track | undefined {
    if (!this.playlist || this.currentTrackIndex < 0) return undefined;
    const nextIdx = this.currentTrackIndex + 1;
    return this.playlist.tracks[nextIdx];
  }

  private advanceAfterTrackEnd(): number | null {
    if (!this.playlist) return null;
    if (this.repeat === 'one') {
      return this.currentTrackIndex;
    }
    if (this.repeat === 'off') {
      return null;
    }
    if (this.shuffle && this.shuffledOrder.length) {
      let pos = this.shuffledOrder.indexOf(this.currentTrackIndex);
      if (pos < 0) pos = 0;
      if (pos < this.shuffledOrder.length - 1) {
        return this.shuffledOrder[pos + 1];
      }
      return this.shuffledOrder[0];
    }
    const next = this.currentTrackIndex + 1;
    if (next < this.playlist.tracks.length) {
      return next;
    }
    return this.playlist.tracks.length > 0 ? 0 : null;
  }
}

export { manifest };
