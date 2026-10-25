import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { toast } from '@/utils/toast'

/** 登录页逻辑：表单状态 + 提交 + 演示账号快捷填充 */
export function useLogin() {
  const router = useRouter()
  const route = useRoute()
  const userStore = useUserStore()

  const form = reactive({ username: '', password: '' })
  const loading = ref(false)

  async function submit(): Promise<void> {
    if (!form.username.trim() || !form.password) {
      toast.info('请输入账号和密码')
      return
    }
    loading.value = true
    try {
      await userStore.login(form.username.trim(), form.password)
      toast.success(`欢迎，${userStore.user?.username}`)
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
      router.replace(redirect)
    } catch {
      // 错误提示由 request 拦截器统一处理
    } finally {
      loading.value = false
    }
  }

  function fillDemo(): void {
    form.username = 'demo'
    form.password = 'demo123'
  }

  return { form, loading, submit, fillDemo }
}
