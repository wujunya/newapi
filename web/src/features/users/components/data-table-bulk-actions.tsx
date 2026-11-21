/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { type Table } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'

import { bulkDeleteUsers } from '../api'
import { ERROR_MESSAGES } from '../constants'
import { type User } from '../types'
import { useUsers } from './users-provider'

interface DataTableBulkActionsProps {
  table: Table<User>
  disabled?: boolean
}

export function DataTableBulkActions({
  table,
  disabled,
}: DataTableBulkActionsProps) {
  const { t } = useTranslation()
  const { requestVerification, triggerRefresh } = useUsers()
  const [targets, setTargets] = useState<User[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const running = useRef(false)
  const selected = table.getRowModel().rows.filter(
    (row) => row.getCanSelect() && row.getIsSelected()
  )

  const selectionChanged =
    targets.length !== selected.length ||
    targets.some((target) => !selected.some((row) => row.original.id === target.id))

  const handleDelete = async () => {
    if (running.current || targets.length === 0 || disabled || selectionChanged) return
    running.current = true
    setIsDeleting(true)
    setTargets([])
    const userIds = targets.map((user) => user.id)

    try {
      const proof = await requestVerification({
        scope: 'admin.user.bulk_delete',
        context: { user_ids: userIds },
        title: t('Bulk delete'),
        description: t('Permanently delete {{total}} selected users? This cannot be undone.', { total: targets.length }),
      })
      if (!proof) return

      const result = await bulkDeleteUsers(userIds, proof.proof_token)
      if (!result.success) {
        handleServerError(result, t(ERROR_MESSAGES.DELETE_FAILED))
        return
      }
      table.setRowSelection((previous) => {
        const next = { ...previous }
        for (const id of userIds) delete next[String(id)]
        return next
      })
      triggerRefresh()
      toast.success(t('Deleted {{deleted}} of {{total}} selected users.', {
        deleted: result.data?.deleted ?? userIds.length,
        total: userIds.length,
      }))
    } catch (error) {
      handleServerError(AuthOperationError.from(error), t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      running.current = false
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Button
        variant='outline'
        size='sm'
        className='text-destructive'
        disabled={disabled || isDeleting || selected.length === 0}
        onClick={() => setTargets(selected.map((row) => row.original))}
      >
        <Trash2 />
        {t('Bulk delete')}{selected.length > 0 ? ` (${selected.length})` : ''}
      </Button>
      <ConfirmDialog
        open={targets.length > 0}
        onOpenChange={(open) => !open && setTargets([])}
        title={t('Bulk delete')}
        desc={t('Permanently delete {{total}} selected users? This cannot be undone.', { total: targets.length })}
        confirmText={t('Delete')}
        disabled={disabled || selectionChanged}
        destructive
        handleConfirm={handleDelete}
      >
        <ul className='max-h-40 overflow-y-auto text-sm wrap-anywhere'>
          {targets.map((user) => (
            <li key={user.id}>{user.username} (#{user.id})</li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  )
}
