import './assets/main.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'

import App from './App.vue'
import router from './router'
import { logger } from './lib/logger'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ToastService)
app.use(ConfirmationService)
app.use(PrimeVue, {
    theme: {
        preset: Aura
    },
    // Global component defaults
    dialog: {
        dismissableMask: true
    }
})

app.directive('tooltip', Tooltip)

app.config.errorHandler = (err, instance, info) => {
    logger.error('Global Error Handler', err as Error, { info, instance: instance?.$?.type?.__name })
    // Future: Send to error tracking service like Sentry
}

// Enable DevTools only in development
app.config.devtools = import.meta.env.DEV
app.config.performance = import.meta.env.DEV

app.mount('#app')