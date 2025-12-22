import { ref, onMounted, onUnmounted } from 'vue'

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface BreakpointMap {
  xs: boolean  // < 576px
  sm: boolean  // >= 576px
  md: boolean  // >= 768px
  lg: boolean  // >= 992px
  xl: boolean  // >= 1200px
}

/**
 * Composable for responsive design and mobile detection
 * Based on PrimeVue breakpoints
 */
export function useResponsive() {
  const windowWidth = ref(0)
  const windowHeight = ref(0)

  const breakpoints = ref<BreakpointMap>({
    xs: false,
    sm: false,
    md: false,
    lg: false,
    xl: false
  })

  const updateDimensions = () => {
    windowWidth.value = window.innerWidth
    windowHeight.value = window.innerHeight

    // Update breakpoints
    breakpoints.value = {
      xs: windowWidth.value < 576,
      sm: windowWidth.value >= 576 && windowWidth.value < 768,
      md: windowWidth.value >= 768 && windowWidth.value < 992,
      lg: windowWidth.value >= 992 && windowWidth.value < 1200,
      xl: windowWidth.value >= 1200
    }
  }

  onMounted(() => {
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateDimensions)
  })

  // Computed properties
  const isMobile = () => breakpoints.value.xs || breakpoints.value.sm
  const isTablet = () => breakpoints.value.md
  const isDesktop = () => breakpoints.value.lg || breakpoints.value.xl
  const isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // Current breakpoint
  const currentBreakpoint = (): Breakpoint => {
    if (breakpoints.value.xs) return 'xs'
    if (breakpoints.value.sm) return 'sm'
    if (breakpoints.value.md) return 'md'
    if (breakpoints.value.lg) return 'lg'
    return 'xl'
  }

  // Responsive columns for PrimeVue grid
  const getGridCols = (desktop: number = 4, tablet: number = 2, mobile: number = 1) => {
    if (isMobile()) return mobile
    if (isTablet()) return tablet
    return desktop
  }

  // Responsive table rows
  const getTableRows = (desktop: number = 50, mobile: number = 10) => {
    return isMobile() ? mobile : desktop
  }

  return {
    windowWidth,
    windowHeight,
    breakpoints,
    isMobile,
    isTablet,
    isDesktop,
    isTouch,
    currentBreakpoint,
    getGridCols,
    getTableRows
  }
}
