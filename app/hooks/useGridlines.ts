import { useState, useEffect } from 'react';

interface GridData {
  verticalLines: number[];
  horizontalLines: number[];
  imageWidth: number;
  imageHeight: number;
}

const defaultGridData: GridData = {
  verticalLines: [],
  horizontalLines: [],
  imageWidth: 0,
  imageHeight: 0,
};

export const useGridlines = (mapName?: string) => {
  const [gridData, setGridData] = useState<GridData>(defaultGridData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGridlines = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const mapParam = mapName 
          ? `?map=${encodeURIComponent(mapName)}` 
          : '';
        const response = await fetch(`/api/gridlines${mapParam}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch gridlines');
        }
        
        const data = await response.json();
        setGridData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching gridlines:', err);
        setGridData(defaultGridData);
      } finally {
        setLoading(false);
      }
    };

    fetchGridlines();
  }, [mapName]);

  return { gridData, loading, error };
};

