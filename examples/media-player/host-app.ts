/**
 * Media player example — Host-side integration (wMCP)
 *
 * Run: npx tsx examples/media-player/host-app.ts
 */

import { WmcpHost } from '../../src/core/host.js';
import { MediaPlayerModule } from './player-module.js';

interface MockTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  format: string;
}

async function main() {
  console.log('=== wMCP Media Player Example ===\n');

  const player = new MediaPlayerModule();
  const host = new WmcpHost(player.wmcpClient);

  const trackDb = new Map<string, MockTrack>();
  trackDb.set('t-1', {
    id: 't-1',
    title: 'Protocol Blues',
    artist: 'The Connectors',
    album: 'wMCP Vol. 1',
    duration: 240,
    format: 'mp3',
  });
  trackDb.set('t-2', {
    id: 't-2',
    title: 'Manifest Destiny',
    artist: 'Schema Band',
    album: 'wMCP Vol. 1',
    duration: 185,
    format: 'mp3',
  });
  trackDb.set('t-3', {
    id: 't-3',
    title: 'Stream of Consciousness',
    artist: 'Async Await',
    album: 'Event Loop',
    duration: 320,
    format: 'flac',
  });
  trackDb.set('t-4', {
    id: 't-4',
    title: 'Capability Anthem',
    artist: 'The Connectors',
    album: 'wMCP Vol. 1',
    duration: 200,
    format: 'mp3',
  });

  const playlists = new Map<string, { id: string; name: string; trackIds: string[] }>();
  playlists.set('pl-1', { id: 'pl-1', name: 'wMCP Greatest Hits', trackIds: ['t-1', 't-2', 't-3'] });

  host.override('player:setVolume', async (params, superFn) => {
    const v = params.volume as number;
    const max = 0.65;
    const capped = Math.min(v, max);
    if (capped !== v) {
      console.log(`[Host] Override player:setVolume: ${v} capped to ${max}`);
    }
    return superFn({ ...params, volume: capped });
  });

  host.connectDirect({
    'playlist:load': async (params) => {
      const pl = playlists.get(params.playlistId as string);
      if (!pl) throw new Error(`Playlist not found: ${params.playlistId}`);
      return {
        id: pl.id,
        name: pl.name,
        tracks: pl.trackIds.map((id) => trackDb.get(id)!).filter(Boolean),
      };
    },
    'playlist:add': async (params) => {
      const pl = playlists.get(params.playlistId as string);
      if (!pl) throw new Error(`Playlist not found: ${params.playlistId}`);
      pl.trackIds.push(params.trackId as string);
      return {
        id: pl.id,
        name: pl.name,
        tracks: pl.trackIds.map((id) => trackDb.get(id)!).filter(Boolean),
      };
    },
    'playlist:remove': async (params) => {
      const pl = playlists.get(params.playlistId as string);
      if (!pl) throw new Error(`Playlist not found: ${params.playlistId}`);
      pl.trackIds = pl.trackIds.filter((id) => id !== params.trackId);
    },
    'track:info': async (params) => {
      const track = trackDb.get(params.trackId as string);
      if (!track) throw new Error(`Track not found: ${params.trackId}`);
      return track;
    },
    'track:stream': async function* (params) {
      const track = trackDb.get(params.trackId as string);
      if (!track) throw new Error(`Track not found: ${params.trackId}`);
      for (let i = 0; i < 3; i++) {
        yield { chunk: i, bytes: 65536, trackId: track.id };
      }
    },
  });

  host.on('playback:stateChanged', (data) => {
    console.log('[Host] playback:stateChanged:', data);
  });
  host.on('playback:progress', (data) => {
    const d = data as { percentage: number };
    if (d.percentage % 33 === 0 || d.percentage === 100) {
      console.log('[Host] playback:progress:', data);
    }
  });
  host.on('track:ended', (data) => {
    console.log('[Host] track:ended:', data);
  });

  host.on('wmcp:ready', () => console.log('[Host] Module is ready'));

  await player.mount({
    config: { volume: 0.7, autoplay: false, repeat: 'off', shuffle: false },
  });

  await player.loadPlaylist('pl-1');

  const before = await host.call('player:getState');
  console.log('[Host] player:getState (initial):', before);

  await host.call('player:play', { trackIndex: 0 });
  await new Promise((r) => setTimeout(r, 30));

  await host.call('player:setVolume', { volume: 0.9 });
  console.log('[Host] Requested volume 0.9 (capped via override); module volume:', player.getStateSnapshot().volume);

  const mid = await host.call('player:getState');
  console.log('[Host] player:getState (may be mid-flight):', mid);

  await new Promise((r) => setTimeout(r, 200));

  const meta = await player.getTrackInfo('t-2');
  console.log('[Host] getTrackInfo:', meta.title, 'by', meta.artist);

  await player.addTrack('t-4');
  host.emit('playlist:updated', { playlistId: 'pl-1' });
  await new Promise((r) => setTimeout(r, 100));

  await host.call('player:play', { trackIndex: 3 });
  await new Promise((r) => setTimeout(r, 200));

  console.log('\n=== Done ===');
  host.destroy();
}

main().catch(console.error);
