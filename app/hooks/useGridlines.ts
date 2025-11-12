import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

interface GridData {
  verticalLines: number[];
  horizontalLines: number[];
  imageWidth: number;
  imageHeight: number;
}

interface MapSettings {
  gridScale: number;
  gridOffsetX: number;
  gridOffsetY: number;
}

const defaultGridData: GridData = {
  verticalLines: [],
  horizontalLines: [],
  imageWidth: 0,
  imageHeight: 0,
};

const DEFAULT_SETTINGS: MapSettings = {
  gridScale: 1.0,
  gridOffsetX: 0,
  gridOffsetY: 0,
};

export const useGridlines = (mapName?: string) => {
  const [gridData, setGridData] = useState<GridData>(defaultGridData);
  const [settings, setSettings] = useState<MapSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGridlinesAndSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch both gridlines and settings in parallel
        const mapParam = mapName 
          ? `?map=${encodeURIComponent(mapName)}` 
          : '';
        
        const [gridlinesResponse, settingsResponse] = await Promise.all([
          fetch(`/api/gridlines${mapParam}`),
          supabase
            .from('map_settings')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
        ]);
        
        // Process gridlines
        if (!gridlinesResponse.ok) {
          throw new Error('Failed to fetch gridlines');
        }
        const gridlinesData = await gridlinesResponse.json();
        setGridData(gridlinesData);
        
        // Process settings
        if (settingsResponse.error) {
          // If no settings exist, use defaults
          if (settingsResponse.error.code === 'PGRST116') {
            setSettings(DEFAULT_SETTINGS);
          } else {
            console.error('Error loading settings:', settingsResponse.error);
            setSettings(DEFAULT_SETTINGS);
          }
        } else if (settingsResponse.data) {
          setSettings({
            gridScale: settingsResponse.data.grid_scale ?? DEFAULT_SETTINGS.gridScale,
            gridOffsetX: settingsResponse.data.grid_offset_x ?? DEFAULT_SETTINGS.gridOffsetX,
            gridOffsetY: settingsResponse.data.grid_offset_y ?? DEFAULT_SETTINGS.gridOffsetY,
          });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching gridlines:', err);
        setGridData(defaultGridData);
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setLoading(false);
      }
    };

    fetchGridlinesAndSettings();
  }, [mapName]);

  return { gridData, settings, loading, error };
};

