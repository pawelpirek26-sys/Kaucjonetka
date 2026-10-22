import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type GeoJSONSourceRef,
  type MapRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Row, StatusDot } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { useTheme } from '@/hooks/use-theme';
import { mapPoints, topBrands, type MapFilters, type MapPoint, type Packaging } from '@/lib/api';
import { activeStoreIds } from '@/lib/db/coupons';
import { getDb } from '@/lib/db';
import { useWalletRevision } from '@/lib/events';
import { distanceMeters, formatDistance, type LatLon } from '@/lib/geo';
import { containsBounds, MIN_POINTS_ZOOM, normaliseBounds, padBounds, toFeatureCollection, type Bounds, type PointProperties } from '@/lib/mapData';
import { openNavigation } from '@/lib/navigation';
import { PACKAGING_LABELS, STATUS_COLORS, STATUS_LABELS, timeAgo } from '@/lib/status';
import { supabase } from '@/lib/supabase/client';

// `||`: an empty value in .env must not leave the map without a style (grey map)
const MAP_STYLE_LIGHT = process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
const MAP_STYLE_DARK = process.env.EXPO_PUBLIC_MAP_STYLE_DARK_URL || 'https://tiles.openfreemap.org/styles/dark';
const EMPTY_IDS: number[] = [];
const POLAND: { center: [number, number]; zoom: number } = { center: [19.4, 52.0], zoom: 5.3 };

type Selected = PointProperties & { lat: number; lon: number };

export default function MapScreen() {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const router = useRouter();
  // optional start position, e.g. kaucjomat://map?lat=52.23&lon=21.01&zoom=14
  const params = useLocalSearchParams<{ lat?: string; lon?: string; zoom?: string }>();
  const [start] = useState(() => {
    const lat = Number(params.lat);
    const lon = Number(params.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !params.lat || !params.lon) return null;
    return { center: [lon, lat] as [number, number], zoom: Number(params.zoom) || 14 };
  });
  const revision = useWalletRevision();
  const map = useRef<MapRef>(null);
  const camera = useRef<CameraRef>(null);
  const source = useRef<GeoJSONSourceRef>(null);

  // stores where the user has active coupons (for highlighting and the filter)
  const mine = useQuery(async () => activeStoreIds(await getDb()), [revision]).data ?? EMPTY_IDS;
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [zoom, setZoom] = useState(POLAND.zoom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [me, setMe] = useState<LatLon | null>(null);
  const [canLocate, setCanLocate] = useState(false);
  const [onlyWorking, setOnlyWorking] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [accepts, setAccepts] = useState<Packaging[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [showBrands, setShowBrands] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  const view = useRef<Bounds | null>(null);
  const zoomRef = useRef(POLAND.zoom);
  const fetched = useRef<{ bounds: Bounds; key: string } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters: MapFilters = useMemo(
    () => ({
      brands: brands.length ? brands : null,
      accepts: accepts.length ? accepts : null,
      onlyWorking,
      storeIds: onlyMine ? mine : null,
    }),
    [brands, accepts, onlyWorking, onlyMine, mine],
  );
  const filtersKey = JSON.stringify(filters);

  // follow the user's position while the map is open (drives the "you are here" marker)
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    if (!canLocate) return;
    (async () => {
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10 }, (pos) =>
        setMe({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      ).catch(() => null);
      if (!alive) sub?.remove();
    })();
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [canLocate]);

  useEffect(() => {
    if (supabase) topBrands(20).then((rows) => setBrandOptions(rows.map((r) => r.brand))).catch(() => undefined);
    Location.getForegroundPermissionsAsync().then(async (p) => {
      if (!p.granted) return;
      setCanLocate(true);
      const pos = await Location.getLastKnownPositionAsync().catch(() => null);
      if (pos) {
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setMe(here);
        if (!start) camera.current?.jumpTo({ center: [here.lon, here.lat], zoom: 13 });
      }
    });
  }, [start]); // `start` never changes after mount

  const load = useCallback(
    async (force = false) => {
      const bounds = view.current;
      if (!bounds || !supabase || zoomRef.current < MIN_POINTS_ZOOM) return;
      if (!force && fetched.current && fetched.current.key === filtersKey && containsBounds(fetched.current.bounds, bounds)) return;
      const padded = padBounds(bounds);
      setLoading(true);
      try {
        const rows = await mapPoints(padded, filters);
        console.log('[map] points loaded:', rows.length);
        fetched.current = { bounds: padded, key: filtersKey };
        setPoints(rows);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [filters, filtersKey],
  );

  useEffect(() => {
    load(true);
  }, [filtersKey, load]);

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    view.current = normaliseBounds(e.nativeEvent.bounds);
    zoomRef.current = e.nativeEvent.zoom;
    setZoom(e.nativeEvent.zoom);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(), 350);
  };

  // onRegionDidChange is not guaranteed for the initial camera, so read the viewport once the style is in
  const onMapLoaded = async () => {
    setMapFailed(false);
    const [bounds, z] = await Promise.all([map.current?.getBounds(), map.current?.getZoom()]).catch(() => [undefined, undefined]);
    if (!bounds || z === undefined || view.current) return;
    view.current = normaliseBounds(bounds);
    zoomRef.current = z;
    setZoom(z);
    load();
  };

  const retryMap = () => {
    setMapFailed(false);
    setMapKey((k) => k + 1);
  };

  const geojson = useMemo(() => toFeatureCollection(points, new Set(mine)), [points, mine]);

  const onPress = async (e: NativeSyntheticEvent<{ features: GeoJSON.Feature[] }>) => {
    const feature = e.nativeEvent.features[0];
    if (!feature || feature.geometry.type !== 'Point') return;
    const [lon, lat] = feature.geometry.coordinates;
    const props = feature.properties ?? {};
    if (props.cluster) {
      const target = await source.current?.getClusterExpansionZoom(props.cluster_id as number);
      camera.current?.easeTo({ center: [lon, lat], zoom: target ?? zoomRef.current + 2, duration: 400 });
      return;
    }
    setSelected({ ...(props as PointProperties), lat, lon });
  };

  const centerOnMe = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    setCanLocate(true);
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    if (!pos) return;
    const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    setMe(here);
    camera.current?.flyTo({ center: [here.lon, here.lat], zoom: 14, duration: 800 });
  };

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <View style={{ flex: 1 }}>
      <Map
        key={mapKey}
        ref={map}
        style={StyleSheet.absoluteFill}
        mapStyle={dark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
        // SurfaceView stays blank inside the native tab container on Android
        androidView="texture"
        logo={false}
        attribution
        attributionPosition={{ bottom: 8, right: 8 }}
        onRegionDidChange={onRegionDidChange}
        onDidFinishLoadingMap={onMapLoaded}
        onDidFailLoadingMap={() => setMapFailed(true)}>
        <Camera ref={camera} initialViewState={start ?? { center: POLAND.center, zoom: POLAND.zoom }} />
        <GeoJSONSource id="kj-points" ref={source} data={geojson} cluster clusterRadius={45} clusterMaxZoom={13} onPress={onPress}>
          <Layer
            id="kj-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': theme.tint,
              'circle-radius': ['step', ['get', 'point_count'], 18, 20, 22, 100, 28],
              'circle-stroke-width': 3,
              'circle-stroke-color': dark ? '#0B0F0D' : '#FFFFFF',
            }}
          />
          <Layer
            id="kj-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 14,
              'text-font': ['Noto Sans Bold'],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{ 'text-color': theme.onTint }}
          />
          <Layer
            id="kj-mine-halo"
            type="circle"
            filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'mine'], true]]}
            paint={{ 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 16, 16, 26], 'circle-color': theme.tint, 'circle-opacity': 0.3 }}
          />
          <Layer
            id="kj-badges"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 13, 17, 17],
              'circle-color': ['get', 'badgeColor'],
              'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 3.5],
              'circle-stroke-color': ['get', 'statusColor'],
            }}
          />
          <Layer
            id="kj-badge-labels"
            type="symbol"
            minzoom={12}
            filter={['!', ['has', 'point_count']]}
            layout={{
              'text-field': ['get', 'badge'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 17, 15],
              'text-font': ['Noto Sans Bold'],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{ 'text-color': ['get', 'badgeText'] }}
          />
        </GeoJSONSource>
        {me ? (
          <Marker id="me" lngLat={[me.lon, me.lat]} anchor="center">
            <View style={styles.meOuter} accessibilityLabel="Twoja pozycja">
              <View style={[styles.meInner, { borderColor: dark ? '#0B0F0D' : '#FFFFFF' }]}>
                <Text style={styles.meIcon}>🚶</Text>
              </View>
            </View>
          </Marker>
        ) : null}
      </Map>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip label="Tylko sprawne" selected={onlyWorking} onPress={() => setOnlyWorking(!onlyWorking)} />
          <Chip label="Gdzie mam kupony" selected={onlyMine} onPress={() => setOnlyMine(!onlyMine)} />
          {(Object.keys(PACKAGING_LABELS) as Packaging[]).map((p) => (
            <Chip key={p} label={PACKAGING_LABELS[p]} selected={accepts.includes(p)} onPress={() => setAccepts(toggle(accepts, p))} />
          ))}
          <Chip label={brands.length ? `Sieci (${brands.length})` : 'Sieci ▾'} selected={brands.length > 0} onPress={() => setShowBrands(!showBrands)} />
        </ScrollView>
        {showBrands ? (
          <Card style={styles.brands}>
            <Row style={{ flexWrap: 'wrap' }}>
              {brandOptions.map((b) => (
                <Chip key={b} label={b} selected={brands.includes(b)} onPress={() => setBrands(toggle(brands, b))} />
              ))}
              {brandOptions.length === 0 ? <ThemedText type="small">Brak listy sieci (offline?)</ThemedText> : null}
            </Row>
            {brands.length ? <Button title="Wyczyść" variant="ghost" onPress={() => setBrands([])} /> : null}
          </Card>
        ) : null}
        {mapFailed ? (
          <Banner text="Nie udało się wczytać mapy. Sprawdź połączenie z internetem." action="Ponów" onAction={retryMap} />
        ) : null}
        {!supabase ? (
          <Banner text="Brak połączenia z serwerem: punkty są niedostępne." />
        ) : error ? (
          <Banner text="Nie udało się pobrać punktów." action="Ponów" onAction={() => load(true)} />
        ) : zoom < MIN_POINTS_ZOOM ? (
          <Banner text="Przybliż mapę, aby zobaczyć punkty zwrotu." />
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.two }} />
        ) : null}
      </SafeAreaView>

      <Pressable accessibilityRole="button" accessibilityLabel="Pokaż moją lokalizację" onPress={centerOnMe} style={({ pressed }) => [styles.locate, { backgroundColor: theme.card, shadowColor: theme.shadow, opacity: pressed ? 0.85 : 1 }]}>
        <View style={[styles.locateRing, { borderColor: theme.tint }]}>
          <View style={[styles.locateDot, { backgroundColor: theme.tint }]} />
        </View>
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} style={[styles.osm, { backgroundColor: dark ? 'rgba(21,27,24,0.85)' : 'rgba(255,255,255,0.85)' }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.osmText}>
          Dane: © OpenStreetMap
        </ThemedText>
      </Pressable>

      {selected ? (
        <Card style={[styles.sheet, { shadowColor: theme.shadow }]}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <ThemedText type="subtitle">{selected.name}</ThemedText>
              <Row>
                <StatusDot color={STATUS_COLORS[selected.status]} />
                <ThemedText type="small">
                  {selected.kind === 'store' && selected.machines === 0
                    ? 'Brak znanego automatu'
                    : `${STATUS_LABELS[selected.status]}${selected.reportedAt ? ` · ${timeAgo(selected.reportedAt)}` : ''}`}
                </ThemedText>
              </Row>
              <ThemedText type="small" themeColor="textSecondary">
                {[me ? formatDistance(distanceMeters(me, selected)) : null, selected.mine ? 'masz tu kupony' : null].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
            <Button title="✕" variant="ghost" onPress={() => setSelected(null)} accessibilityHint="Zamknij kartę punktu" />
          </Row>
          <Row>
            <Button
              style={{ flex: 1 }}
              title="Szczegóły"
              onPress={() => router.push(selected.storeId ? `/point?storeId=${selected.storeId}` : `/point?machineId=${selected.machineId}`)}
            />
            <Button style={{ flex: 1 }} title="Nawiguj" variant="secondary" onPress={() => openNavigation(selected.lat, selected.lon, selected.name)} />
          </Row>
        </Card>
      ) : null}
    </View>
  );
}

function Banner({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <ThemedText type="small" style={{ flex: 1 }}>
        {text}
      </ThemedText>
      {action && onAction ? <Button title={action} variant="ghost" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  filters: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  brands: { marginHorizontal: Spacing.three },
  banner: {
    marginHorizontal: Spacing.three,
    marginTop: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  locate: {
    position: 'absolute',
    right: Spacing.three,
    bottom: 140,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  locateRing: { width: 24, height: 24, borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  locateDot: { width: 8, height: 8, borderRadius: 4 },
  meOuter: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(37,128,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  meInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2580FF',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  meIcon: { fontSize: 20, lineHeight: 24 },
  osm: { position: 'absolute', left: 8, bottom: 8, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  osmText: { fontSize: 11 },
  sheet: { position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.three, elevation: 8, shadowOpacity: 0.18, shadowRadius: 16 },
});
