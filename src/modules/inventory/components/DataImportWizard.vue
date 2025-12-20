<script setup lang="ts">
import { ref, computed } from 'vue'
import { useImportMapper } from '../composables/useImportMapper'
import { supabase } from '@/lib/supabase'
import { useToast } from 'primevue/usetoast'

// PrimeVue
import Button from 'primevue/button'
import FileUpload from 'primevue/fileupload'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import StepPanels from 'primevue/steppanels'
import StepItem from 'primevue/stepitem'
import Step from 'primevue/step'
import StepPanel from 'primevue/steppanel'

const props = withDefaults(defineProps<{
    mode?: 'inventory' | 'products' | 'locations'
}>(), {
    mode: 'inventory'
})

const toast = useToast()
const { 
    SYSTEM_FIELDS, 
    fileHeaders, 
    columnMapping, 
    validationErrors, 
    validRows, 
    isParsing, 
    parseFile, 
    validateData 
} = useImportMapper(props.mode)

const activeStep = ref(1)
const importing = ref(false)
const importResult = ref<any>(null)

// --- STEP 1: UPLOAD ---
const onFileSelect = async (event: any) => {
    const file = event.files[0]
    try {
        await parseFile(file)
        toast.add({ severity: 'success', summary: 'File Parsed', detail: `${fileHeaders.value.length} columns found` })
        activeStep.value = 2
    } catch (e) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to parse file' })
    }
}

// --- STEP 2: MAPPING ---
const unmappedFields = computed(() => {
    return SYSTEM_FIELDS.value.filter(f => f.required && !columnMapping.value[f.key])
})

const canProceedToValidation = computed(() => {
    return unmappedFields.value.length === 0
})

const goToValidation = () => {
    if (validateData()) {
        activeStep.value = 3
    } else {
        activeStep.value = 3 // Still go to validation to show errors
    }
}

// --- STEP 3: VALIDATION ---
const isValid = computed(() => validationErrors.value.length === 0 && validRows.value.length > 0)

const commitImport = async () => {
    importing.value = true
    try {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            throw new Error("You must be logged in to perform an import. Please refresh the page or log in again.")
        }

        // 1. Create Job
        const { data: job, error: jobError } = await supabase
            .from('import_jobs')
            .insert({
                filename: 'Import Upload',
                total_rows: validRows.value.length,
                status: 'pending',
                user_id: user.id
            })
            .select()
            .single()

        if (jobError) throw jobError

        // 2. Call RPC
        let rpcName = 'process_inventory_import'
        if (props.mode === 'products') rpcName = 'process_product_import'
        if (props.mode === 'locations') rpcName = 'process_location_import'

        const { error: rpcError } = await supabase.rpc(rpcName, {
            p_job_id: job.id,
            p_items: validRows.value
        })

        if (rpcError) throw rpcError

        // 3. Fetch Final Status
        const { data: finalJob } = await supabase
            .from('import_jobs')
            .select('*')
            .eq('id', job.id)
            .single()

        importResult.value = finalJob
        activeStep.value = 4
        toast.add({ severity: 'success', summary: 'Success', detail: 'Import processed' })

    } catch (e: any) {
        console.error(e)
        toast.add({ severity: 'error', summary: 'Import Failed', detail: e.message })
    } finally {
        importing.value = false
    }
}

</script>

<template>
    <div class="card">
        <Stepper v-model:value="activeStep">
            <StepList>
                <StepItem :value="1">
                    <Step>Upload</Step>
                </StepItem>
                <StepItem :value="2">
                    <Step>Map Columns</Step>
                </StepItem>
                <StepItem :value="3">
                    <Step>Validate</Step>
                </StepItem>
                <StepItem :value="4">
                    <Step>Result</Step>
                </StepItem>
            </StepList>

            <StepPanels>
                <!-- STEP 1: UPLOAD -->
                <StepPanel :value="1">
                    <div class="flex flex-column align-items-center justify-content-center p-5 border-2 border-dashed surface-border border-round">
                        <i class="pi pi-cloud-upload text-6xl text-500 mb-4"></i>
                        <div class="text-900 text-xl font-medium mb-3">Upload {{ mode.charAt(0).toUpperCase() + mode.slice(1) }} File</div>
                        <p class="text-500 mb-4 text-center">Supported formats: .csv, .xlsx, .xls</p>
                        <FileUpload 
                            mode="basic" 
                            :auto="true" 
                            chooseLabel="Select File" 
                            accept=".csv, .xlsx, .xls" 
                            :maxFileSize="1000000" 
                            customUpload 
                            @select="onFileSelect" 
                        />
                        <div v-if="isParsing" class="mt-3">
                            <i class="pi pi-spin pi-spinner"></i> Parsing...
                        </div>
                    </div>
                </StepPanel>

                <!-- STEP 2: MAPPING -->
                <StepPanel :value="2">
                    <div class="grid">
                        <div class="col-12 mb-3">
                            <Message severity="info">Map your file columns to the system fields below.</Message>
                        </div>
                        
                        <div class="col-12 md:col-6" v-for="field in SYSTEM_FIELDS" :key="field.key">
                            <div class="surface-card p-3 shadow-2 border-round h-full border-left-3" :class="columnMapping[field.key] ? 'border-green-500' : 'border-orange-500'">
                                <div class="font-bold mb-2">
                                    {{ field.label }}
                                    <span v-if="field.required" class="text-red-500">*</span>
                                </div>
                                <Select 
                                    v-model="columnMapping[field.key]" 
                                    :options="fileHeaders" 
                                    placeholder="Select Column" 
                                    class="w-full"
                                    showClear
                                />
                                <small class="text-500 block mt-2">
                                    Mapped to: <span class="font-mono">{{ columnMapping[field.key] || '(Unmapped)' }}</span>
                                </small>
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-content-end mt-4 gap-2">
                        <Button label="Back" severity="secondary" @click="activeStep = 1" />
                        <Button label="Next: Validate" @click="goToValidation" :disabled="!canProceedToValidation" />
                    </div>
                </StepPanel>

                <!-- STEP 3: VALIDATION -->
                <StepPanel :value="3">
                    <div class="flex flex-column gap-4">
                        <!-- Summary -->
                        <div class="flex justify-content-between align-items-center surface-card p-4 border-round shadow-1">
                            <div class="flex align-items-center gap-3">
                                <i class="pi pi-check-circle text-3xl text-green-500"></i>
                                <div>
                                    <div class="text-xl font-bold text-900">Validation Complete</div>
                                    <div class="text-500">Review the results below before importing.</div>
                                </div>
                            </div>
                            <div class="flex gap-4 text-center">
                                <div>
                                    <div class="text-2xl font-bold text-green-600">{{ validRows.length }}</div>
                                    <div class="text-sm text-500">Valid Rows</div>
                                </div>
                                <div>
                                    <div class="text-2xl font-bold text-red-600">{{ validationErrors.length }}</div>
                                    <div class="text-sm text-500">Errors</div>
                                </div>
                            </div>
                        </div>

                        <!-- Errors Section -->
                        <div v-if="validationErrors.length > 0">
                            <Message severity="warn" :closable="false">
                                <div class="flex align-items-center gap-2">
                                    <i class="pi pi-exclamation-triangle"></i>
                                    <span>{{ validationErrors.length }} rows have errors and will be <strong>skipped</strong>.</span>
                                </div>
                            </Message>
                            
                            <DataTable :value="validationErrors" size="small" stripedRows paginator :rows="5" class="mt-3">
                                <Column field="row" header="Row #" sortable style="width: 6rem" />
                                <Column header="Issues">
                                    <template #body="{ data }">
                                        <ul class="pl-3 m-0">
                                            <li v-for="issue in data.issues" :key="issue" class="text-red-600">{{ issue }}</li>
                                        </ul>
                                    </template>
                                </Column>
                                <Column header="Data">
                                    <template #body="{ data }">
                                        <pre class="text-xs m-0">{{ JSON.stringify(data.data, null, 2) }}</pre>
                                    </template>
                                </Column>
                            </DataTable>
                        </div>

                        <!-- Valid Data Preview -->
                        <div v-if="validRows.length > 0">
                            <div class="text-lg font-bold mb-2">Preview Valid Data</div>
                            <DataTable :value="validRows.slice(0, 5)" size="small" stripedRows>
                                <template #header>First 5 Rows</template>
                                <Column v-for="field in SYSTEM_FIELDS.slice(0, 5)" :key="field.key" :field="field.key" :header="field.label" />
                            </DataTable>
                        </div>
                        
                        <div v-else class="text-center p-5">
                            <i class="pi pi-times-circle text-6xl text-red-500 mb-3"></i>
                            <div class="text-xl font-bold text-900">No valid rows found</div>
                            <p class="text-500">Please fix your file and try again.</p>
                        </div>
                    </div>

                    <div class="flex justify-content-end mt-4 gap-2">
                        <Button label="Back" severity="secondary" @click="activeStep = 2" />
                        <Button 
                            :label="validationErrors.length > 0 ? `Import ${validRows.length} Valid Rows` : 'Commit Import'" 
                            :severity="validationErrors.length > 0 ? 'warning' : 'success'" 
                            icon="pi pi-check" 
                            @click="commitImport" 
                            :loading="importing" 
                            :disabled="validRows.length === 0" 
                        />
                    </div>
                </StepPanel>

                <!-- STEP 4: RESULT -->
                <StepPanel :value="4">
                    <div v-if="importResult" class="flex flex-column align-items-center p-5">
                        <i v-if="importResult.error_count === 0" class="pi pi-check-circle text-6xl text-green-500 mb-3"></i>
                        <i v-else class="pi pi-exclamation-triangle text-6xl text-orange-500 mb-3"></i>
                        
                        <div class="text-2xl font-bold mb-2">Import {{ importResult.status }}</div>
                        
                        <div class="grid w-full max-w-30rem mt-4 text-center">
                            <div class="col-4">
                                <div class="text-500">Total</div>
                                <div class="text-xl font-bold">{{ importResult.total_rows }}</div>
                            </div>
                            <div class="col-4">
                                <div class="text-500">Success</div>
                                <div class="text-xl font-bold text-green-600">{{ importResult.success_count }}</div>
                            </div>
                            <div class="col-4">
                                <div class="text-500">Errors</div>
                                <div class="text-xl font-bold text-red-600">{{ importResult.error_count }}</div>
                            </div>
                        </div>

                        <div v-if="importResult.error_count > 0" class="w-full mt-4">
                            <div class="text-red-600 font-bold mb-2">Errors Occurred:</div>
                            <div class="surface-ground p-3 border-round text-sm" style="max-height: 200px; overflow-y: auto;">
                                <pre>{{ JSON.stringify(importResult.errors, null, 2) }}</pre>
                            </div>
                        </div>

                        <Button label="Start New Import" class="mt-5" @click="activeStep = 1" />
                    </div>
                </StepPanel>
            </StepPanels>
        </Stepper>
    </div>
</template>
