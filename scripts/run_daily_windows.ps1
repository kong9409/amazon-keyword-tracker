# 修改成你的实际目录
Set-Location "D:\amazon_keyword_tracker_dual_output"
# 每日定时任务建议调用 --once，不打开网页服务
npm run run *>> keyword_tracker.log
