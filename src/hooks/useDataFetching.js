import { useState, useCallback, useRef, useEffect } from 'react';
import useLoader from './useLoader';

const useDataFetching = (fetchDataCallback) => {
  const [data, setData] = useState([]);
  const [showLoading, setShowLoading] = useState(false);
  const [allDataLoaded, setAllDataLoaded] = useState(false);
  const [offset, setOffset] = useState(0);
  const hasData = useRef(false);
  const isFetching = useRef(false);
  const loadingTimer = useRef(null);

  // Delayed loading — only show spinner after 400ms, skip it if data arrives fast
  const startDelayedLoading = useCallback(() => {
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    loadingTimer.current = setTimeout(() => setShowLoading(true), 400);
  }, []);

  const stopDelayedLoading = useCallback(() => {
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    loadingTimer.current = null;
    setShowLoading(false);
  }, []);

  useEffect(() => {
    return () => { if (loadingTimer.current) clearTimeout(loadingTimer.current); };
  }, []);

  const fetchData = useCallback(async (newFilters = {}) => {
    // Only show spinner if we have no data yet
    if (!hasData.current) startDelayedLoading();
    isFetching.current = true;
    try {
      const limit = newFilters.limit ?? 50;
      const params = { offset: 0, limit, ...newFilters };
      const fetchedData = await fetchDataCallback(params);
      const list = fetchedData || [];
      setData(list);
      hasData.current = list.length > 0;
      setAllDataLoaded(list.length < limit);
      setOffset(0);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      isFetching.current = false;
      stopDelayedLoading();
    }
  }, [fetchDataCallback, startDelayedLoading, stopDelayedLoading]);

  const fetchMoreData = async (newFilters = {}) => {
    if (isFetching.current || allDataLoaded) return;
    isFetching.current = true;
    startDelayedLoading();
    try {
      const limit = newFilters.limit ?? 50;
      const nextOffset = offset + limit;
      const params = { offset: nextOffset, limit, ...newFilters };
      const fetchedData = await fetchDataCallback(params);
      const list = fetchedData || [];
      if (list.length === 0) {
        setAllDataLoaded(true);
      } else {
        setData((prevData) => [...prevData, ...list]);
        setOffset(nextOffset);
        if (list.length < limit) setAllDataLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching more data:', error);
    } finally {
      isFetching.current = false;
      stopDelayedLoading();
    }
  };

  const setDataWithTracking = useCallback((newData) => {
    const list = typeof newData === 'function' ? newData(data) : newData;
    if (list && list.length > 0) hasData.current = true;
    setData(newData);
  }, [data]);

  return { data, loading: showLoading, fetchData, fetchMoreData, setData: setDataWithTracking };
};

export default useDataFetching;
