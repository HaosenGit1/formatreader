% MATLAB sample (.m is shared with Objective-C; the content decides)
power = [2410 2385 0 2450];
online = power > 0;
fprintf('%d of %d online\n', sum(online), numel(power));
plot(power, '-o'); title('Turbine power');
