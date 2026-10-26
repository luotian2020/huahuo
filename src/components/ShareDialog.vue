<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import qrcode from "qrcode-generator";
import { buildCharacterShareUrl, copyText, isWeChatBrowser } from "../utils/share";

const props = defineProps({
  character: { type: Object, required: true },
});
defineEmits(["close"]);

const inWeChat = isWeChatBrowser();
const shareUrl = computed(() => buildCharacterShareUrl(props.character.id));
const copied = ref(false);
let copyTimer = 0;

const qrSvg = computed(() => {
  const qr = qrcode(0, "M");
  qr.addData(shareUrl.value);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
});

async function handleCopy() {
  if (!(await copyText(shareUrl.value))) return;
  copied.value = true;
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => {
    copied.value = false;
  }, 2000);
}

onBeforeUnmount(() => window.clearTimeout(copyTimer));
</script>

<template>
  <div class="dialog-backdrop" @click.self="$emit('close')">
    <section class="dialog-card share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
      <button class="dialog-close" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      <span class="section-kicker">SHARE / 微信分享</span>
      <h2 id="share-dialog-title">{{ character.name }}</h2>

      <template v-if="inWeChat">
        <div class="share-wechat-guide">
          <span aria-hidden="true">↗</span>
          <strong>点击右上角 ···</strong>
          <small>选择「发送给朋友」或「分享到朋友圈」</small>
        </div>
        <p>也可以复制下方链接，粘贴到微信聊天中发送。</p>
      </template>
      <template v-else>
        <p>用微信「扫一扫」打开角色页，再点击右上角 ··· 分享给朋友或朋友圈。</p>
        <div class="share-qr" role="img" aria-label="角色分享二维码" v-html="qrSvg"></div>
      </template>

      <div class="share-link">
        <input :value="shareUrl" readonly aria-label="角色分享链接" @focus="$event.target.select()" />
        <button class="secondary-button" type="button" @click="handleCopy">
          {{ copied ? "已复制" : "复制链接" }}
        </button>
      </div>
      <p class="share-note">打开链接无需登录即可浏览该角色的动作参考。</p>
    </section>
  </div>
</template>
