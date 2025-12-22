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

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ToastService)
app.use(ConfirmationService)
app.use(PrimeVue, {
    theme: {
        preset: Aura
    }
})

app.directive('tooltip', Tooltip)

app.config.errorHandler = (err, instance, info) => {
    console.error('Global Error Handler:', err)
    console.error('Info:', info)
    // You could also send this to a logging service like Sentry
}

// Enable DevTools in production for internal debugging
app.config.devtools = true
app.config.performance = true

app.mount('#app')