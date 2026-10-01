import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useItemsDB } from '@/composables/useDB'
import type { ShoppingItem } from '@/db'

export const useItemsStore = defineStore('items', () => {
  const itemsDB = useItemsDB()

  // State
  const items = ref<Map<string, ShoppingItem[]>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const getItemsByListId = (listId: string) => {
    return computed(() => items.value.get(listId) || [])
  }

  const getCompletedCount = (listId: string) => {
    const listItems = items.value.get(listId) || []
    return listItems.filter((item) => item.completed).length
  }

  const getTotalCount = (listId: string) => {
    return (items.value.get(listId) || []).length
  }

  // Actions
  const loadItems = async (listId: string) => {
    loading.value = true
    error.value = null
    try {
      const listItems = await itemsDB.getByListId(listId)
      items.value.set(listId, listItems)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load items'
      console.error('Failed to load items:', e)
    } finally {
      loading.value = false
    }
  }

  const createItem = async (
    listId: string,
    name: string,
    category: string,
    quantity = 1,
    unit?: string,
  ) => {
    loading.value = true
    error.value = null
    try {
      const item = await itemsDB.create(listId, name, category, quantity, unit)
      const listItems = items.value.get(listId) || []
      items.value.set(listId, [...listItems, item])
      return item
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create item'
      console.error('Failed to create item:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  const updateItem = async (listId: string, id: string, updates: Partial<ShoppingItem>) => {
    loading.value = true
    error.value = null
    try {
      await itemsDB.update(id, updates)
      const listItems = items.value.get(listId) || []
      const item = listItems.find((i) => i.id === id)
      if (item) {
        Object.assign(item, updates)
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update item'
      console.error('Failed to update item:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  const toggleItemComplete = async (listId: string, id: string) => {
    loading.value = true
    error.value = null
    try {
      const updated = await itemsDB.toggleComplete(id)
      if (!updated) return
      const listItems = items.value.get(listId) || []
      const index = listItems.findIndex((i) => i.id === id)
      if (index >= 0) listItems[index] = updated
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to toggle item'
      throw e
    } finally {
      loading.value = false
    }
  }

  const deleteItem = async (listId: string, id: string) => {
    loading.value = true
    error.value = null
    try {
      await itemsDB.remove(id)
      const listItems = items.value.get(listId) || []
      items.value.set(
        listId,
        listItems.filter((item) => item.id !== id),
      )
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete item'
      console.error('Failed to delete item:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  const removeCompletedItems = async (listId: string) => {
    loading.value = true
    error.value = null
    try {
      await itemsDB.removeCompleted(listId)
      const listItems = items.value.get(listId) || []
      items.value.set(
        listId,
        listItems.filter((item) => !item.completed),
      )
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to remove completed items'
      console.error('Failed to remove completed items:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  const updateItemsByName = async (itemName: string, updates: Partial<ShoppingItem>) => {
    loading.value = true
    error.value = null
    try {
      const count = await itemsDB.updateByName(itemName, updates)

      // Update all items in memory with matching name
      const normalizedName = itemName.toLowerCase().trim()
      items.value.forEach((listItems) => {
        listItems.forEach((item) => {
          if (item.name.toLowerCase().trim() === normalizedName) {
            Object.assign(item, updates)
          }
        })
      })

      return count
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update items by name'
      console.error('Failed to update items by name:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  const importItem = async (item: ShoppingItem) => {
    loading.value = true
    error.value = null
    try {
      const newItem = await itemsDB.importItem(item)
      const listItems = items.value.get(newItem.listId) || []
      items.value.set(newItem.listId, [...listItems, newItem])
      return newItem
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to import item'
      console.error('Failed to import item:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    items,
    loading,
    error,
    // Getters
    getItemsByListId,
    getCompletedCount,
    getTotalCount,
    // Actions
    loadItems,
    createItem,
    importItem,
    updateItem,
    toggleItemComplete,
    deleteItem,
    removeCompletedItems,
    updateItemsByName,
  }
})
