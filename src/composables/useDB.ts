import { db, type ShoppingList, type ShoppingItem, type Product } from '@/db'
import { v4 as uuidv4 } from 'uuid'

/**
 * Composable for Shopping List database operations
 * This layer separates database logic from store logic for better testability
 */
export function useListsDB() {
  const getAll = async (): Promise<ShoppingList[]> => {
    return await db.lists.toArray()
  }

  const getActive = async (): Promise<ShoppingList[]> => {
    return await db.lists.where('archived').equals(0).toArray()
  }

  const getArchived = async (): Promise<ShoppingList[]> => {
    return await db.lists.where('archived').equals(1).toArray()
  }

  const getById = async (id: string): Promise<ShoppingList | undefined> => {
    return await db.lists.get(id)
  }

  const create = async (name: string, color?: string): Promise<ShoppingList> => {
    const list: ShoppingList = {
      id: uuidv4(),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
      color,
    }
    await db.lists.add(list)
    return list
  }

  const update = async (id: string, updates: Partial<ShoppingList>): Promise<void> => {
    await db.lists.update(id, {
      ...updates,
      updatedAt: Date.now(),
    })
  }

  const archive = async (id: string): Promise<void> => {
    await db.lists.update(id, {
      archived: true,
      updatedAt: Date.now(),
    })
  }

  const unarchive = async (id: string): Promise<void> => {
    await db.lists.update(id, {
      archived: false,
      updatedAt: Date.now(),
    })
  }

  const remove = async (id: string): Promise<void> => {
    await db.lists.delete(id)
    // Also delete all items in this list
    await db.items.where('listId').equals(id).delete()
  }

  const duplicate = async (id: string): Promise<ShoppingList> => {
    const original = await db.lists.get(id)
    if (!original) {
      throw new Error('List not found')
    }

    const newList: ShoppingList = {
      id: uuidv4(),
      name: `${original.name} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
      color: original.color,
    }
    await db.lists.add(newList)

    // Copy all items from original list
    const items = await db.items.where('listId').equals(id).toArray()
    const newItems = items.map((item) => ({
      ...item,
      id: uuidv4(),
      listId: newList.id,
      completed: false,
      addedAt: Date.now(),
      completedAt: undefined,
    }))
    await db.items.bulkAdd(newItems)

    return newList
  }

  return {
    getAll,
    getActive,
    getArchived,
    getById,
    create,
    update,
    archive,
    unarchive,
    remove,
    duplicate,
  }
}

/**
 * Composable for Shopping Item database operations
 */
export function useItemsDB() {
  const getByListId = async (listId: string): Promise<ShoppingItem[]> => {
    return await db.items.where('listId').equals(listId).toArray()
  }

  const getById = async (id: string): Promise<ShoppingItem | undefined> => {
    return await db.items.get(id)
  }

  const create = async (
    listId: string,
    name: string,
    category: string,
    quantity = 1,
    unit?: string,
  ): Promise<ShoppingItem> => {
    const item: ShoppingItem = {
      id: uuidv4(),
      listId,
      name,
      quantity,
      unit,
      category,
      completed: false,
      addedAt: Date.now(),
    }
    await db.items.add(item)
    return item
  }

  // Importa un item preservando todos sus campos.
  // Genera un id nuevo para evitar colisiones en modo merge.
  const importItem = async (item: ShoppingItem): Promise<ShoppingItem> => {
    const newItem: ShoppingItem = {
      ...item,
      id: uuidv4(),
    }
    await db.items.add(newItem)
    return newItem
  }

  const update = async (id: string, updates: Partial<ShoppingItem>): Promise<void> => {
    await db.items.update(id, updates)
  }

  const toggleComplete = async (id: string): Promise<void> => {
    const item = await db.items.get(id)
    if (!item) return

    await db.items.update(id, {
      completed: !item.completed,
      completedAt: !item.completed ? Date.now() : undefined,
    })
  }

  const remove = async (id: string): Promise<void> => {
    await db.items.delete(id)
  }

  const removeCompleted = async (listId: string): Promise<void> => {
    await db.items
      .where('listId')
      .equals(listId)
      .and((item) => item.completed)
      .delete()
  }

  const updateByName = async (
    itemName: string,
    updates: Partial<ShoppingItem>,
  ): Promise<number> => {
    const normalizedName = itemName.toLowerCase().trim()
    const itemsToUpdate = await db.items
      .filter((item) => item.name.toLowerCase().trim() === normalizedName)
      .toArray()

    // Update each matching item
    await Promise.all(itemsToUpdate.map((item) => db.items.update(item.id, updates)))

    return itemsToUpdate.length
  }

  return {
    getByListId,
    getById,
    create,
    importItem,
    update,
    toggleComplete,
    remove,
    removeCompleted,
    updateByName,
  }
}

/**
 * Composable for Products database operations
 */
export function useProductsDB() {
  const getAll = async (): Promise<Product[]> => {
    return await db.products.toArray()
  }

  const getByBarcode = async (barcode: string): Promise<Product | undefined> => {
    return await db.products.get(barcode)
  }

  const save = async (product: Product): Promise<void> => {
    await db.products.put(product)
  }

  const remove = async (barcode: string): Promise<void> => {
    await db.products.delete(barcode)
  }

  const clear = async (): Promise<void> => {
    await db.products.clear()
  }

  return {
    getAll,
    getByBarcode,
    save,
    delete: remove,
    clear,
  }
}

export function useDB() {
  return {
    useListsDB,
    useItemsDB,
    useProductsDB,
  }
}
