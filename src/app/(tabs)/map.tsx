import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  UserLocation,
  type CameraRef,
  type GeoJSONSourceRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
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

const MAP_STYLE = process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY_IDS: number[] = [];
const POLAND: { center: [number, number]; zoom: number } = { center: [19.4, 52.0], zoom: 5.3 };

type Selected = PointProperties & { lat: number; lon: number };

export default function MapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const revision = useWalletRevision();
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
  const [onlyWorking, setOnlyWorking] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [accepts, setAccepts] = useState<Packaging[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [showBrands, setShowBrands] = useState(false);

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

  useEffect(() => {
    if (supabase) topBrands(20).then((rows) => setBrandOptions(rows.map((r) => r.brand))).catch(() => undefined);
    Location.getForegroundPermissionsAsync().then(async (p) => {
      if (!p.granted) return;
      const pos = await Location.getLastKnownPositionAsync().catch(() => null);
      if (pos) {
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setMe(here);
        camera.current?.jumpTo({ center: [here.lon, here.lat], zoom: 13 });
      }
    });
  }, []);

  const load = useCallback(
    async (force = false) => {
      const bounds = view.current;
      if (!bounds || !supabase || zoomRef.current < MIN_POINTS_ZOOM) return;
      if (!force && fetched.current && fetched.current.key === filtersKey && containsBounds(fetched.current.bounds, bounds)) return;
      const padded = padBounds(bounds);
      setLoading(true);
      try {
        const rows = await mapPoints(padded, filters);
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
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    if (!pos) return;
    const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    setMe(here);
    camera.current?.flyTo({ center: [here.lon, here.lat], zoom: 14, duration: 800 });
  };

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <View style={{ flex: 1 }}>
      <Map style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE} logo={false} attribution attributionPosition={{ bottom: 8, right: 8 }} onRegionDidChange={onRegionDidChange}>
        <Camera ref={camera} initialViewState={{ center: POLAND.center, zoom: POLAND.zoom }} />
        <UserLocation />
        <GeoJSONSource id="points" ref={source} data={geojson} cluster clusterRadius={45} clusterMaxZoom={14} onPress={onPress}>
          <Layer
            id="clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': '#1F7A4D',
              'circle-opacity': 0.85,
              'circle-radius': ['step', ['get', 'point_count'], 16, 20, 20, 100, 26],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13, 'text-font': ['Noto Sans Bold'] }}
            paint={{ 'text-color': '#FFFFFF' }}
          />
          <Layer
            id="points-mine"
            type="circle"
            filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'mine'], true]]}
            paint={{ 'circle-radius': 14, 'circle-color': '#1F7A4D', 'circle-opacity': 0.25 }}
          />
          <Layer
            id="points"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-radius': ['case', ['>', ['get', 'machines'], 0], 8, 6],
              'circle-color': [
                'match',
                ['get', 'status'],
                'ok', STATUS_COLORS.ok,
                'warning', STATUS_COLORS.warning,
                'broken', STATUS_COLORS.broken,
                STATUS_COLORS.unknown,
              ],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#FFFFFF',
            }}
          />
        </GeoJSONSource>
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

      <Pressable accessibilityRole="button" accessibilityLabel="Pokaż moją lokalizację" onPress={centerOnMe} style={[styles.locate, { backgroundColor: theme.card }]}>
        <ThemedText style={{ fontSize: 20 }}>◎</ThemedText>
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} style={styles.osm}>
        <ThemedText type="small" style={styles.osmText}>
          Dane: © OpenStreetMap
        </ThemedText>
      </Pressable>

      {selected ? (
        <Card style={styles.sheet}>
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
    <View style={[styles.banner, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locate: {
    position: 'absolute',
    right: Spacing.three,
    bottom: 140,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  osm: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 4, paddingHorizontal: 4 },
  osmText: { color: '#333', fontSize: 11 },
  sheet: { position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.three, elevation: 4 },
});
