import { configureStore } from '@reduxjs/toolkit'
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'
import newsReducer from '../features/news/newsSlice'
import { nytApi } from '../features/news/nytApi'

// Configure the Redux store. We register our news slice and the RTK
// query reducer for NYTimes. Additional middleware from RTK Query
// handles caching and refetching automatically.
export const store = configureStore({
  reducer: {
    news: newsReducer,
    [nytApi.reducerPath]: nytApi.reducer
  },
  middleware: (gDM) => gDM().concat(nytApi.middleware)
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector