import { useListsStore } from '@/stores/lists'
import { useItemsStore } from '@/stores/items'
import { useCategoriesStore } from '@/stores/categories'
import { useProductsStore } from '@/stores/products'
import type { ShoppingList, ShoppingItem, Category, Product } from '@/db'

export interface BackupData {
  version: string
  timestamp: number
  lists: ShoppingList[]
  items: ShoppingItem[]
  customCategories: Category[]
  products: Product[]
  categoryPreferences: Record<string, string>
  categoryOrder: string[]
}

export interface BackupValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Composable for backing up and restoring application data
 */
export function useBackup() {
  const listsStore = useListsStore()
  const itemsStore = useItemsStore()
  const categoriesStore = useCategoriesStore()
  const productsStore = useProductsStore()

  /**
   * Export all application data to a backup object
   */
  const exportBackup = async (): Promise<BackupData> => {
    // Load all data from stores
    await listsStore.loadLists()
    await productsStore.loadProducts()
    await categoriesStore.loadCustomCategories()

    // Load all items for all lists
    const allItems: ShoppingItem[] = []
    for (const list of listsStore.lists) {
      await itemsStore.loadItems(list.id)
      const listItems = itemsStore.getItemsByListId(list.id).value
      allItems.push(...listItems)
    }

    // Get category preferences from localStorage
    const categoryPreferences: Record<string, string> = {}
    try {
      const stored = localStorage.getItem('categoryPreferences')
      if (stored) {
        Object.assign(categoryPreferences, JSON.parse(stored))
      }
    } catch (error) {
      console.error('Failed to load category preferences:', error)
    }

    // Get category order from localStorage
    let categoryOrder: string[] = []
    try {
      const stored = localStorage.getItem('categoryOrder')
      if (stored) {
        categoryOrder = JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to load category order:', error)
    }

    return {
      version: '1.0.0',
      timestamp: Date.now(),
      lists: listsStore.lists,
      items: allItems,
      customCategories: categoriesStore.customCategories,
      products: productsStore.products,
      categoryPreferences,
      categoryOrder,
    }
  }

  /**
   * Download backup data as a JSON file
   */
  const downloadBackup = async (): Promise<void> => {
    const backup = await exportBackup()
    const json = JSON.stringify(backup, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `shopping-list-backup-${timestamp}.json`

    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Validate backup data structure
   */
  const validateBackup = (data: unknown): BackupValidationResult => {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      errors.push('Backup data must be an object')
      return { valid: false, errors }
    }

    const backup = data as Partial<BackupData>

    // Check required fields
    if (!backup.version) {
      errors.push('Missing version field')
    }

    if (typeof backup.timestamp !== 'number') {
      errors.push('Missing or invalid timestamp field')
    }

    if (!Array.isArray(backup.lists)) {
      errors.push('Missing or invalid lists array')
    }

    if (!Array.isArray(backup.items)) {
      errors.push('Missing or invalid items array')
    }

    if (!Array.isArray(backup.customCategories)) {
      errors.push('Missing or invalid customCategories array')
    }

    if (!Array.isArray(backup.products)) {
      errors.push('Missing or invalid products array')
    }

    // Validate version compatibility
    if (backup.version && !backup.version.startsWith('1.')) {
      errors.push(`Incompatible backup version: ${backup.version}`)
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Import backup data and restore to database
   */
  const importBackup = async (
    backupData: BackupData,
    options: { merge?: boolean } = {},
  ): Promise<void> => {
    const { merge = false } = options

    // Validate backup first
    const validation = validateBackup(backupData)
    if (!validation.valid) {
      throw new Error(`Invalid backup: ${validation.errors.join(', ')}`)
    }

    // If not merging, clear existing data
    if (!merge) {
      // Delete all lists (this will also delete their items due to cascade)
      const listIds = listsStore.lists.map((l) => l.id)
      for (const id of listIds) {
        await listsStore.deleteList(id)
      }

      // Clear products
      await productsStore.clearProducts()

      // Delete all custom categories
      const categoryIds = categoriesStore.customCategories.map((c) => c.id)
      for (const id of categoryIds) {
        await categoriesStore.deleteCategory(id)
      }
    }

    // Restore custom categories first (they're referenced by items)
    for (const category of backupData.customCategories) {
      await categoriesStore.createCategory(category.name, category.icon || '📦')
    }

    // Restore products
    for (const product of backupData.products) {
      await productsStore.saveProduct({
        barcode: product.barcode,
        name: product.name,
        category: product.category,
      })
    }

    // Restore lists
    for (const list of backupData.lists) {
      const newList = await listsStore.createList(list.name, list.color)

      // If list was archived, archive the new one
      if (list.archived) {
        await listsStore.archiveList(newList.id)
      }

      // Restore items for this list, preserving all fields
      const listItems = backupData.items.filter((item) => item.listId === list.id)
      for (const item of listItems) {
        await itemsStore.importItem({
          ...item,
          listId: newList.id, // remapear al nuevo listId
        })
      }
    }

    // Restore category preferences to localStorage
    if (backupData.categoryPreferences) {
      try {
        localStorage.setItem('categoryPreferences', JSON.stringify(backupData.categoryPreferences))
      } catch (error) {
        console.error('Failed to restore category preferences:', error)
      }
    }

    // Restore category order to localStorage
    if (backupData.categoryOrder && backupData.categoryOrder.length > 0) {
      try {
        categoriesStore.saveCategoryOrder(backupData.categoryOrder)
      } catch (error) {
        console.error('Failed to restore category order:', error)
      }
    }

    // Reload all stores to reflect the restored data
    await listsStore.loadLists()
    await productsStore.loadProducts()
    await categoriesStore.loadCustomCategories()
  }

  /**
   * Import backup from a file
   */
  const importBackupFromFile = async (
    file: File,
    options: { merge?: boolean } = {},
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string
          const backupData = JSON.parse(content) as BackupData
          await importBackup(backupData, options)
          resolve()
        } catch (error) {
          if (error instanceof Error) {
            reject(new Error(`Failed to import backup: ${error.message}`))
          } else {
            reject(new Error('Failed to import backup: Unknown error'))
          }
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read backup file'))
      }

      reader.readAsText(file)
    })
  }

  return {
    exportBackup,
    downloadBackup,
    validateBackup,
    importBackup,
    importBackupFromFile,
  }
}
