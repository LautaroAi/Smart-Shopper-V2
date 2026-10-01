import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useListsStore } from '@/stores/lists'
import { useItemsStore } from '@/stores/items'
import { useProductsStore } from '@/stores/products'
import { useCategoriesStore } from '@/stores/categories'
import { usePreferencesStore } from '@/stores/preferences'
import { useBackup } from '@/composables/useBackup'
import { useItemsDB } from '@/composables/useDB'

describe('Rule 2.3: Local backup and restore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('Export backup', () => {
    it('should export all lists and items', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const { exportBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      await itemsStore.createItem(list.id, 'Milk', 'dairy')
      await itemsStore.createItem(list.id, 'Bread', 'bakery')

      const backup = await exportBackup()

      expect(backup.version).toBe('1.0.0')
      expect(backup.lists).toHaveLength(1)
      expect(backup.items).toHaveLength(2)
      expect(backup.timestamp).toBeTypeOf('number')
    })

    it('should export products and custom categories', async () => {
      const productsStore = useProductsStore()
      const categoriesStore = useCategoriesStore()
      const { exportBackup } = useBackup()

      await productsStore.saveProduct({
        barcode: '123456',
        name: 'Test Product',
        category: 'pantry',
      })
      await categoriesStore.createCategory('Pets', '🐾')

      const backup = await exportBackup()

      expect(backup.products).toHaveLength(1)
      expect(backup.products[0]?.barcode).toBe('123456')
      expect(backup.customCategories.length).toBeGreaterThanOrEqual(1)
    })

    it('should include archived lists in backup', async () => {
      const listsStore = useListsStore()
      const { exportBackup } = useBackup()

      const list = await listsStore.createList('Old')
      await listsStore.archiveList(list.id)

      const backup = await exportBackup()

      expect(backup.lists).toHaveLength(1)
      expect(backup.lists[0]?.archived).toBe(true)
    })
  })

  describe('Import backup - basic restore', () => {
    it('should restore lists and items', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      await itemsStore.createItem(list.id, 'Milk', 'dairy')
      await itemsStore.createItem(list.id, 'Bread', 'bakery')

      const backup = await exportBackup()

      // Wipe everything
      await listsStore.deleteList(list.id)

      await importBackup(backup)

      await listsStore.loadLists()
      expect(listsStore.lists).toHaveLength(1)
      expect(listsStore.lists[0]?.name).toBe('Weekly')

      const restoredListId = listsStore.lists[0]!.id
      await itemsStore.loadItems(restoredListId)
      const items = itemsStore.getItemsByListId(restoredListId).value

      expect(items).toHaveLength(2)
      expect(items.map((i) => i.name).sort()).toEqual(['Bread', 'Milk'])
    })

    it('should restore archived state on lists', async () => {
      const listsStore = useListsStore()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Old')
      await listsStore.archiveList(list.id)

      const backup = await exportBackup()
      await listsStore.deleteList(list.id)

      await importBackup(backup)
      await listsStore.loadLists()

      expect(listsStore.lists).toHaveLength(1)
      expect(listsStore.lists[0]?.archived).toBe(true)
    })

    it('should throw on invalid backup data', async () => {
      const { importBackup } = useBackup()

      await expect(
        importBackup({ foo: 'bar' } as unknown as Parameters<typeof importBackup>[0]),
      ).rejects.toThrow(/Invalid backup/i)
    })
  })

  // Item restoration must preserve ALL fields
  describe('Item data preservation (regression for bug 1)', () => {
    it('should preserve quantity and unit on restore', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      await itemsStore.createItem(list.id, 'Milk', 'dairy', 3, 'bottle')

      const backup = await exportBackup()
      await listsStore.deleteList(list.id)
      await importBackup(backup)

      await listsStore.loadLists()
      const restoredListId = listsStore.lists[0]!.id
      await itemsStore.loadItems(restoredListId)
      const item = itemsStore.getItemsByListId(restoredListId).value[0]!

      expect(item.quantity).toBe(3)
      expect(item.unit).toBe('bottle')
    })

    it('should preserve notes and barcode on restore', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const itemsDB = useItemsDB()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      const created = await itemsStore.createItem(list.id, 'Milk', 'dairy')
      await itemsDB.update(created.id, {
        notes: 'sin lactosa',
        barcode: '8412345678901',
      })

      const backup = await exportBackup()
      await listsStore.deleteList(list.id)
      await importBackup(backup)

      await listsStore.loadLists()
      const restoredListId = listsStore.lists[0]!.id
      await itemsStore.loadItems(restoredListId)
      const item = itemsStore.getItemsByListId(restoredListId).value[0]!

      expect(item.notes).toBe('sin lactosa')
      expect(item.barcode).toBe('8412345678901')
    })

    it('should preserve completed state and completedAt on restore', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      const item = await itemsStore.createItem(list.id, 'Milk', 'dairy')
      await itemsStore.toggleItemComplete(list.id, item.id)

      const completedAtBefore = itemsStore.getItemsByListId(list.id).value[0]!.completedAt
      expect(completedAtBefore).toBeTypeOf('number')

      const backup = await exportBackup()
      await listsStore.deleteList(list.id)
      await importBackup(backup)

      await listsStore.loadLists()
      const restoredListId = listsStore.lists[0]!.id
      await itemsStore.loadItems(restoredListId)
      const restored = itemsStore.getItemsByListId(restoredListId).value[0]!

      expect(restored.completed).toBe(true)
      expect(restored.completedAt).toBe(completedAtBefore)
    })

    it('should preserve addedAt timestamp on restore', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      await itemsStore.createItem(list.id, 'Milk', 'dairy')

      const addedAtBefore = itemsStore.getItemsByListId(list.id).value[0]!.addedAt

      const backup = await exportBackup()
      await listsStore.deleteList(list.id)
      await importBackup(backup)

      await listsStore.loadLists()
      const restoredListId = listsStore.lists[0]!.id
      await itemsStore.loadItems(restoredListId)
      const restored = itemsStore.getItemsByListId(restoredListId).value[0]!

      expect(restored.addedAt).toBe(addedAtBefore)
    })

    it('should preserve every field across multiple items', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const itemsDB = useItemsDB()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Weekly')

      const milk = await itemsStore.createItem(list.id, 'Milk', 'dairy', 2, 'bottle')
      const bread = await itemsStore.createItem(list.id, 'Bread', 'bakery', 1)
      await itemsDB.update(milk.id, { notes: 'semi', barcode: '111' })
      await itemsDB.update(bread.id, { notes: 'integral', barcode: '222' })

      const backup = await exportBackup()
      await listsStore.deleteList(list.id)
      await importBackup(backup)

      await listsStore.loadLists()
      const restoredListId = listsStore.lists[0]!.id
      await itemsStore.loadItems(restoredListId)
      const restored = itemsStore.getItemsByListId(restoredListId).value

      const rMilk = restored.find((i) => i.name === 'Milk')!
      const rBread = restored.find((i) => i.name === 'Bread')!

      expect(rMilk.quantity).toBe(2)
      expect(rMilk.unit).toBe('bottle')
      expect(rMilk.notes).toBe('semi')
      expect(rMilk.barcode).toBe('111')

      expect(rBread.quantity).toBe(1)
      expect(rBread.notes).toBe('integral')
      expect(rBread.barcode).toBe('222')
    })

    it('should not reuse the original item ids (safe for merge)', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      await itemsStore.createItem(list.id, 'Milk', 'dairy')

      const originalIds = itemsStore.getItemsByListId(list.id).value.map((i) => i.id)
      expect(originalIds).toHaveLength(1)

      const backup = await exportBackup()
      await importBackup(backup, { merge: true })
      await listsStore.loadLists()

      // Tras merge hay 2 listas. Recogemos TODOS los items de TODAS las listas.
      const allIds = new Set<string>()
      for (const l of listsStore.lists) {
        await itemsStore.loadItems(l.id)
        for (const it of itemsStore.getItemsByListId(l.id).value) {
          allIds.add(it.id)
        }
      }

      // Los IDs originales siguen presentes...
      for (const id of originalIds) {
        expect(allIds.has(id)).toBe(true)
      }

      // ...y hay al menos tantos IDs nuevos como originales (no se reutilizaron).
      const newIds = [...allIds].filter((id) => !originalIds.includes(id))
      expect(newIds.length).toBeGreaterThanOrEqual(originalIds.length)
    })
  })

  describe('Category preferences backup (regression for bug 2)', () => {
    it('should export preferences from IndexedDB, not localStorage', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const preferencesStore = usePreferencesStore()
      const { exportBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      const item = await itemsStore.createItem(list.id, 'Milk', 'dairy')

      // El usuario mueve Milk de dairy → beverages
      await preferencesStore.savePreference(item.name, 'beverages')

      const backup = await exportBackup()

      expect(backup.categoryPreferences).toEqual({ milk: 'beverages' })
    })

    it('should restore preferences into IndexedDB on import', async () => {
      const listsStore = useListsStore()
      const itemsStore = useItemsStore()
      const preferencesStore = usePreferencesStore()
      const { exportBackup, importBackup } = useBackup()

      const list = await listsStore.createList('Weekly')
      const item = await itemsStore.createItem(list.id, 'Milk', 'dairy')
      await preferencesStore.savePreference(item.name, 'beverages')

      const backup = await exportBackup()
      await listsStore.deleteList(list.id)
      await preferencesStore.clearAll()

      await importBackup(backup)

      await preferencesStore.loadPreferences()
      expect(preferencesStore.getPreferredCategory('Milk')).toBe('beverages')
    })

    it('should clear preferences on replace, keep them on merge', async () => {
      const listsStore = useListsStore()
      const preferencesStore = usePreferencesStore()
      const { exportBackup, importBackup } = useBackup()

      await listsStore.createList('Weekly')
      await preferencesStore.savePreference('Milk', 'beverages')
      const backup = await exportBackup()

      // Añadimos una preferencia que NO está en el backup
      await preferencesStore.savePreference('Bread', 'bakery')

      // merge: false → la extra debe desaparecer
      await importBackup(backup, { merge: false })
      await preferencesStore.loadPreferences()
      expect(preferencesStore.getPreferredCategory('Milk')).toBe('beverages')
      expect(preferencesStore.getPreferredCategory('Bread')).toBeNull()

      // merge: true → la extra debe sobrevivir
      await preferencesStore.savePreference('Bread', 'bakery')
      await importBackup(backup, { merge: true })
      await preferencesStore.loadPreferences()
      expect(preferencesStore.getPreferredCategory('Bread')).toBe('bakery')
    })
  })

  describe('Backup validation', () => {
    it('should reject invalid backup data', () => {
      const { validateBackup } = useBackup()

      const result = validateBackup({ foo: 'bar' })

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should reject incompatible backup versions', () => {
      const { validateBackup } = useBackup()

      const result = validateBackup({
        version: '2.0.0',
        timestamp: Date.now(),
        lists: [],
        items: [],
        customCategories: [],
        products: [],
        categoryPreferences: {},
        categoryOrder: [],
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Incompatible'))).toBe(true)
    })

    it('should accept a valid backup object', async () => {
      const listsStore = useListsStore()
      const { exportBackup, validateBackup } = useBackup()
      await listsStore.createList('Test')

      const backup = await exportBackup()
      const result = validateBackup(backup)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('Merge vs replace mode', () => {
    it('should replace existing data when merge is false', async () => {
      const listsStore = useListsStore()
      const { exportBackup, importBackup } = useBackup()

      await listsStore.createList('Original')
      const backup = await exportBackup()

      await listsStore.createList('Extra')
      expect(listsStore.lists).toHaveLength(2)

      await importBackup(backup, { merge: false })
      await listsStore.loadLists()

      expect(listsStore.lists).toHaveLength(1)
      expect(listsStore.lists[0]?.name).toBe('Original')
    })

    it('should keep existing data when merge is true', async () => {
      const listsStore = useListsStore()
      const { exportBackup, importBackup } = useBackup()

      await listsStore.createList('Original')
      const backup = await exportBackup()

      await listsStore.createList('Extra')
      await importBackup(backup, { merge: true })
      await listsStore.loadLists()

      const names = listsStore.lists.map((l) => l.name)
      expect(names).toContain('Original')
      expect(names).toContain('Extra')
    })
  })
})
